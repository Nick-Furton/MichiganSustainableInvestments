-- =====================================================================================
-- Michigan Sustainable Investments - contact form (run this THIRD, after 01_core.sql).
-- Safe to run more than once: every statement is written so that a second run changes nothing.
--
-- How it works, in plain English:
--   * A visitor fills in the form on the Contact page. The website cannot write to the table
--     itself. It can only call ONE function, send_contact_message(), which checks the message
--     and files it.
--   * Nobody outside the board can read messages: not visitors, not members.
--   * Admins (the board) read messages on the admin page, mark them handled, or delete them.
--   * The form switches itself on. When the website is built it asks contact_form_ready(); only
--     if that answers does the site show the Contact button and page. Until this file has been
--     run, the site simply has no contact form.
--   * The abuse limits live here, in the database, because the browser is never trusted.
-- =====================================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  organization text not null default '' check (char_length(organization) <= 160),
  topic text not null check (topic in ('recruiting', 'speaking', 'joining', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  handled_at timestamptz,          -- set when a board member marks the message handled
  handled_by text                  -- that board member's email
);
create index if not exists contact_messages_created_at on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Start from nothing, then grant only what is needed. Visitors get no access to the table at all.
-- Signed-in users get read and delete, which the policies below narrow to admins. Nobody can edit
-- a message: marking one handled goes through set_contact_handled().
revoke all on public.contact_messages from anon, authenticated;
grant select, delete on public.contact_messages to authenticated;

drop policy if exists contact_admin_select on public.contact_messages;
create policy contact_admin_select on public.contact_messages for select to authenticated using (public.is_admin());
drop policy if exists contact_admin_delete on public.contact_messages;
create policy contact_admin_delete on public.contact_messages for delete to authenticated using (public.is_admin());

-- ---------- The one way in ------------------------------------------------------------
-- Called by the Contact page for a visitor who is not signed in. Runs with the owner's rights
-- so it can add a row to a table the visitor cannot touch. Each refusal raises a short code
-- (contact_name, contact_email, ...) that the page turns into a plain sentence.
-- p_trap is a hidden form field that people never see; a robot that fills it in gets a silent
-- "thanks" and nothing is stored.
create or replace function public.send_contact_message(p_name text, p_email text, p_organization text, p_topic text, p_message text, p_trap text default '')
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_org text := btrim(regexp_replace(coalesce(p_organization, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  v_topic text := coalesce(p_topic, '');
  v_message text := btrim(coalesce(p_message, ''));
begin
  if coalesce(p_trap, '') <> '' then return; end if;

  if char_length(v_name) not between 1 and 120 then raise exception 'contact_name'; end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'contact_email'; end if;
  if char_length(v_org) > 160 then raise exception 'contact_organization'; end if;
  if v_topic not in ('recruiting', 'speaking', 'joining', 'other') then raise exception 'contact_topic'; end if;
  if char_length(v_message) not between 10 and 4000 then raise exception 'contact_message'; end if;

  -- Abuse limits. One sender: 3 messages a day. Everyone together: 20 an hour, and at most 500
  -- messages waiting for the board. The lock makes the counts exact when two arrive at once.
  perform pg_advisory_xact_lock(hashtext('public.contact_messages'));
  if (select count(*) from public.contact_messages m where m.email = v_email and m.created_at > now() - interval '1 day') >= 3 then
    raise exception 'contact_limit_sender';
  end if;
  if (select count(*) from public.contact_messages m where m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'contact_limit_busy';
  end if;
  if (select count(*) from public.contact_messages m where m.handled_at is null) >= 500 then
    raise exception 'contact_limit_busy';
  end if;

  insert into public.contact_messages (name, email, organization, topic, message)
  values (v_name, v_email, v_org, v_topic, v_message);
end $$;

-- The website asks this when it is built. It answers only once this file has been run.
create or replace function public.contact_form_ready() returns boolean
language sql stable set search_path = public, pg_temp as $$ select true $$;

-- The board marks a message handled (or reopens it). Messages cannot be edited any other way.
create or replace function public.set_contact_handled(message_id uuid, handled boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.contact_messages
     set handled_at = case when handled then coalesce(handled_at, now()) end,
         handled_by = case when handled then coalesce(handled_by, public.signed_in_email()) end
   where id = message_id;
  if not found then raise exception 'No such message'; end if;
end $$;

revoke all on function public.send_contact_message(text, text, text, text, text, text), public.contact_form_ready(), public.set_contact_handled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.send_contact_message(text, text, text, text, text, text), public.contact_form_ready() to anon, authenticated;
grant execute on function public.set_contact_handled(uuid, boolean) to authenticated;

-- Tell the API layer about the new functions straight away.
notify pgrst, 'reload schema';
