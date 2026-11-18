-- =====================================================================================
-- Michigan Sustainable Investments - core database setup (run this FIRST).
-- Safe to run more than once: every statement is written so that a second run changes nothing.
--
-- How access works, in plain English:
--   * Anyone with an @umich.edu Google account can sign in, then draft and submit their OWN
--     profile. Nothing is public, and nobody counts as a member, until the board approves.
--   * Approving a profile adds its owner to the "roster", which is what makes someone a member.
--     The board can also pre-load the roster by hand (optional).
--   * Everyone can see and edit ONLY their own profile. They cannot see anyone else's.
--   * Admins (the board) can read every profile, approve it, send it back, take it down or delete it.
--   * The public website reads two "views" that are built ONLY from the snapshot taken at
--     approval time, so nothing unconsented or private (email, notes, status) can leak.
--   * The database makes every decision. The browser is never trusted.
-- =====================================================================================

-- ---------- Tables -------------------------------------------------------------------

-- Confirmed members. Filled by approving a profile (or by hand). Emails must be lower-case @umich.edu.
create table if not exists public.roster (
  email text primary key,
  constraint roster_email_ok check (email = lower(email) and email like '%@umich.edu')
);

-- Board administrators. Same rule. Add the first admin with one SQL line (see docs/SETUP.md).
create table if not exists public.admins (
  email text primary key,
  constraint admins_email_ok check (email = lower(email) and email like '%@umich.edu')
);

-- One profile per signed-in person. Deleting the sign-in account deletes the profile.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  class_year int,
  school text,
  major text,
  linkedin_url text,
  headshot_path text,
  bio text,
  -- Five consent switches. Everything defaults to "do not publish".
  show_identity boolean not null default false,          -- name, class year, school, major
  show_headshot boolean not null default false,
  show_linkedin boolean not null default false,
  show_placements boolean not null default false,
  show_name_on_placements boolean not null default false,
  status text not null default 'draft',
  review_note text,                                      -- the board's note when it asks for changes
  published jsonb,                                       -- the public snapshot, written only at approval
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint profiles_status_ok check (status in ('draft', 'submitted', 'approved', 'changes_requested')),
  constraint profiles_linkedin_ok check (linkedin_url is null or linkedin_url ~ '^https://www\.linkedin\.com/in/[^[:space:]/?#]+/?$'),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 400)
);

create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  firm text not null,
  team text,
  kind text not null,
  year int,
  constraint placements_kind_ok check (kind in ('internship', 'full_time'))
);
create index if not exists placements_profile_idx on public.placements (profile_id);

-- Board titles are set by admins only. One row per person.
create table if not exists public.board_positions (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

-- ---------- Helper functions ---------------------------------------------------------
-- SECURITY DEFINER = they run with the owner's rights so they can look at the roster even
-- though members cannot. The fixed search_path stops anyone hijacking them.

-- The one place that decides "who is this person". It returns the caller's email ONLY when the
-- sign-in token says the account was created through Google AND the address ends in @umich.edu;
-- otherwise NULL (which matches nobody on the roster or admin list).
-- Why: if email/password sign-ups were ever left switched on by mistake, anyone could register
-- a board member's address (without owning it) and would otherwise be treated as that person.
-- Binding to the Google provider closes that hole even when the dashboard setting is wrong.
create or replace function public.signed_in_email() returns text
language sql stable set search_path = public, pg_temp as $$
  select case
           when auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
            and lower(auth.jwt() ->> 'email') like '%@umich.edu'
           then lower(auth.jwt() ->> 'email')
         end;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins a where a.email = public.signed_in_email());
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.roster r where r.email = public.signed_in_email())
      or public.is_admin();
$$;

-- Any signed-in @umich.edu Google account may have (draft, submit, delete) its own profile.
create or replace function public.can_have_profile() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.signed_in_email() is not null;
$$;

-- What the website asks right after sign-in:
--   'admin'     on the admin list
--   'member'    on the roster (an approved member)
--   'applicant' a signed-in @umich.edu Google account that is not on the roster yet
--   'none'      anything else (for example a token that did not come from Google)
create or replace function public.my_access() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.is_admin() then 'admin'
              when exists (select 1 from public.roster r where r.email = public.signed_in_email()) then 'member'
              when public.can_have_profile() then 'applicant'
              else 'none' end;
$$;

-- ---------- Guard trigger on profiles ------------------------------------------------
-- Members may only move a profile between 'draft' and 'submitted' and may not touch the
-- review note, the public snapshot, the approval date, the email or the id.
-- Rule is applied to anyone connecting as a normal signed-in user (role "authenticated"),
-- admins included: admins use approve_profile() / request_changes() instead.
-- The official functions below run as the database owner, so the guard lets them through.

-- NOTE: deliberately NOT security definer, so current_user tells us who is really writing.
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'submitted') then
        raise exception 'Members may only save a draft or submit for approval';
      end if;
      if new.review_note is not null or new.published is not null or new.approved_at is not null then
        raise exception 'Those fields are set by the board';
      end if;
      -- The email always comes from the sign-in token, never from the browser.
      new.email := public.signed_in_email();
      if new.email is null then raise exception 'Sign in with your @umich.edu Google account'; end if;
    else
      if new.id is distinct from old.id then raise exception 'The id cannot be changed'; end if;
      if new.email is distinct from old.email then raise exception 'The email cannot be changed'; end if;
      if new.review_note is distinct from old.review_note
         or new.published is distinct from old.published
         or new.approved_at is distinct from old.approved_at then
        raise exception 'Those fields are set by the board';
      end if;
      if new.status not in ('draft', 'submitted') then
        raise exception 'Members may only save a draft or submit for approval';
      end if;
      -- Editing an approved profile sends it back for approval. The old public snapshot stays
      -- live until the board approves again.
      if old.status = 'approved' and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        new.status := 'submitted';
      elsif old.status = 'approved' then
        new.status := 'approved';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- When someone changes the placements of an approved profile, send the profile back for review.
create or replace function public.placements_touch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid := coalesce(new.profile_id, old.profile_id);
begin
  update public.profiles set status = 'submitted', updated_at = now() where id = pid and status = 'approved';
  return null;
end $$;

drop trigger if exists placements_touch_trg on public.placements;
create trigger placements_touch_trg after insert or update or delete on public.placements
  for each row execute function public.placements_touch();

-- ---------- Extra constraints (safe to re-run) ---------------------------------------
-- Each one drops and re-adds itself so running this file again changes nothing.
alter table public.profiles drop constraint if exists profiles_headshot_own_folder;
alter table public.profiles add constraint profiles_headshot_own_folder
  check (headshot_path is null or headshot_path ~ ('^' || id::text || '/[A-Za-z0-9_-]+\.webp$'));
alter table public.profiles drop constraint if exists profiles_text_len;
alter table public.profiles add constraint profiles_text_len
  check (char_length(full_name) <= 120 and char_length(school) <= 120 and char_length(major) <= 120);
alter table public.profiles drop constraint if exists profiles_class_year_range;
alter table public.profiles add constraint profiles_class_year_range check (class_year between 2015 and 2040);
alter table public.placements drop constraint if exists placements_text_len;
alter table public.placements add constraint placements_text_len check (char_length(firm) <= 120 and char_length(team) <= 120);
alter table public.placements drop constraint if exists placements_year_range;
alter table public.placements add constraint placements_year_range check (year between 2015 and 2040);
alter table public.board_positions drop constraint if exists board_title_len;
alter table public.board_positions add constraint board_title_len check (char_length(title) <= 120);

-- At most 20 placements per profile.
create or replace function public.placements_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.placements where profile_id = new.profile_id) >= 20 then
    raise exception 'At most 20 placements per profile';
  end if;
  return new;
end $$;
drop trigger if exists placements_limit_trg on public.placements;
create trigger placements_limit_trg before insert on public.placements
  for each row execute function public.placements_limit();

-- ---------- Row-level security -------------------------------------------------------
alter table public.roster enable row level security;
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.placements enable row level security;
alter table public.board_positions enable row level security;

-- Start from nothing, then grant only what is needed.
revoke all on public.roster, public.admins, public.profiles, public.placements, public.board_positions from anon, authenticated;
grant select, insert, update, delete on public.roster, public.admins, public.board_positions to authenticated;
grant select, insert, update, delete on public.profiles, public.placements to authenticated;

-- roster / admins: admins only.
drop policy if exists roster_admin on public.roster;
create policy roster_admin on public.roster for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admins_admin on public.admins;
create policy admins_admin on public.admins for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: a person sees and changes only their own row (any signed-in @umich.edu Google account).
drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select to authenticated using (id = auth.uid() and public.can_have_profile());
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles for insert to authenticated with check (id = auth.uid() and public.can_have_profile());
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid() and public.can_have_profile()) with check (id = auth.uid() and public.can_have_profile());
drop policy if exists profiles_own_delete on public.profiles;
create policy profiles_own_delete on public.profiles for delete to authenticated using (id = auth.uid() and public.can_have_profile());
-- admins: read everything (changes go through the approve/request-changes functions).
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated using (public.is_admin());

-- placements: same idea, through the owning profile.
drop policy if exists placements_own on public.placements;
create policy placements_own on public.placements for all to authenticated
  using (profile_id = auth.uid() and public.can_have_profile()) with check (profile_id = auth.uid() and public.can_have_profile());
drop policy if exists placements_admin_select on public.placements;
create policy placements_admin_select on public.placements for select to authenticated using (public.is_admin());

-- board_positions: members may read their own title; only admins write.
drop policy if exists board_own_select on public.board_positions;
create policy board_own_select on public.board_positions for select to authenticated using (profile_id = auth.uid());
drop policy if exists board_admin on public.board_positions;
create policy board_admin on public.board_positions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Board actions (functions that re-check the caller) -----------------------

create or replace function public.approve_profile(profile_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.profiles; snap jsonb := '{}'::jsonb; pl jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into p from public.profiles where id = profile_id;
  if not found then raise exception 'No such profile'; end if;

  -- The snapshot holds ONLY what the member agreed to publish.
  if p.show_identity then
    snap := snap || jsonb_build_object('full_name', p.full_name, 'class_year', p.class_year, 'school', p.school, 'major', p.major);
  end if;
  if p.show_headshot and p.headshot_path is not null then snap := snap || jsonb_build_object('headshot_path', p.headshot_path); end if;
  if p.show_linkedin and p.linkedin_url is not null then snap := snap || jsonb_build_object('linkedin_url', p.linkedin_url); end if;
  if p.show_placements then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'firm', x.firm, 'team', x.team, 'kind', x.kind, 'year', x.year,
             'member_name', case when p.show_name_on_placements then p.full_name end,
             'class_year', case when p.show_name_on_placements and p.show_identity then p.class_year end))
           order by x.year desc nulls last, x.firm), '[]'::jsonb)
      into pl from public.placements x where x.profile_id = p.id;
    snap := snap || jsonb_build_object('placements', pl);
  end if;

  update public.profiles
     set published = snap, status = 'approved', approved_at = now(), review_note = null
   where id = profile_id;
  -- Approval is what makes someone a member.
  if p.email is not null then
    insert into public.roster (email) values (p.email) on conflict do nothing;
  end if;
end $$;

-- The board deletes a profile outright (its placements and board title go with it).
create or replace function public.delete_profile(profile_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.profiles where id = profile_id;
  if not found then raise exception 'No such profile'; end if;
end $$;

create or replace function public.request_changes(profile_id uuid, note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set status = 'changes_requested', review_note = note where id = profile_id;
  if not found then raise exception 'No such profile'; end if;
end $$;

-- The board takes any published profile down. The member sees "Changes requested" with the note.
create or replace function public.unpublish_profile(profile_id uuid, note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if note is null or btrim(note) = '' then raise exception 'A note is required'; end if;
  update public.profiles set published = null, approved_at = null, status = 'changes_requested', review_note = note where id = profile_id;
  if not found then raise exception 'No such profile'; end if;
end $$;

-- A member takes their own profile off the public site. It becomes a draft again.
create or replace function public.unpublish_my_profile() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_have_profile() then raise exception 'Sign in with your @umich.edu Google account'; end if;
  update public.profiles set published = null, approved_at = null, status = 'draft' where id = auth.uid();
end $$;

revoke all on function public.approve_profile(uuid), public.request_changes(uuid, text), public.unpublish_my_profile(), public.unpublish_profile(uuid, text), public.delete_profile(uuid) from public, anon;
grant execute on function public.approve_profile(uuid), public.request_changes(uuid, text), public.unpublish_my_profile(), public.unpublish_profile(uuid, text), public.delete_profile(uuid) to authenticated;
revoke all on function public.is_admin(), public.is_member(), public.my_access(), public.signed_in_email(), public.can_have_profile() from public, anon;
grant execute on function public.is_admin(), public.is_member(), public.my_access(), public.signed_in_email(), public.can_have_profile() to authenticated;

-- ---------- Public read models (what the website builds Team and Placements from) ---
-- Views run with the owner's rights (so they can read the locked tables) but they only select
-- from the published snapshot. Email, status and notes are not selected, so they cannot leak.

create or replace view public.public_profiles as
select p.id as profile_id,
       p.published ->> 'full_name' as full_name,
       (p.published ->> 'class_year')::int as class_year,
       p.published ->> 'school' as school,
       p.published ->> 'major' as major,
       p.published ->> 'linkedin_url' as linkedin_url,
       p.published ->> 'headshot_path' as headshot_path,
       b.title as board_title,
       b.sort_order as sort_order
  from public.profiles p
  left join public.board_positions b on b.profile_id = p.id
 where p.published is not null and p.published ? 'full_name';

create or replace view public.public_placements as
select e ->> 'firm' as firm,
       e ->> 'team' as team,
       e ->> 'kind' as kind,
       (e ->> 'year')::int as year,
       e ->> 'member_name' as member_name,
       (e ->> 'class_year')::int as class_year
  from public.profiles p, jsonb_array_elements(coalesce(p.published -> 'placements', '[]'::jsonb)) e
 where p.published is not null;

revoke all on public.public_profiles, public.public_placements from anon, authenticated;
grant select on public.public_profiles, public.public_placements to anon, authenticated;

-- ---------- Defence in depth: only @umich.edu accounts can exist ---------------------
-- The roster and row-level security above are the REAL gate. This trigger only makes it
-- impossible to create or change an account to a non-umich address.
create or replace function public.reject_non_umich() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email is null or lower(new.email) not like '%@umich.edu' then
    raise exception 'Only @umich.edu accounts are allowed';
  end if;
  -- An account's email never changes: roster and admin entries are keyed on it.
  if tg_op = 'UPDATE' and new.email is distinct from old.email then
    raise exception 'An account email cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists reject_non_umich_trg on auth.users;
create trigger reject_non_umich_trg before insert or update of email on auth.users
  for each row execute function public.reject_non_umich();
