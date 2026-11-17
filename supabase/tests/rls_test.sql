-- Database tests. Any failed assertion raises an error; psql runs with ON_ERROR_STOP so the run exits non-zero.
\set ON_ERROR_STOP 1
\set QUIET 1
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set eve   '33333333-3333-3333-3333-333333333333'
\set boss  '44444444-4444-4444-4444-444444444444'
\set dana  '55555555-5555-5555-5555-555555555555'

create schema t;
create table t.results (name text);
grant usage on schema t to public;
grant insert on t.results to public;
create function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  insert into t.results values (name);
  raise notice 'PASS: %', name;
end $$;
-- Passes only if running the statement raises an error.
create function t.throws(stmt text, name text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute stmt; exception when others then failed := true; end;
  perform t.ok(failed, name);
end $$;
-- Number of rows the statement returns / changes.
create function t.count(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') q' into n; return n; end $$;
create function t.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute stmt; get diagnostics n = row_count; return n; end $$;
-- Builds a sign-in token like Supabase's: the provider lives in app_metadata (default: google).
create function t.claims(email text, uid text, provider text default 'google') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'email', email, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('provider', provider))::text, false) $$;
grant execute on all functions in schema t to public;

-- Fixtures (as the database owner): four accounts, two on the roster, one admin.
insert into auth.users (id, email) values
  (:'alice', 'alice@umich.edu'), (:'bob', 'bob@umich.edu'), (:'eve', 'eve@umich.edu'), (:'boss', 'boss@umich.edu'), (:'dana', 'dana@umich.edu');
insert into public.roster values ('alice@umich.edu'), ('bob@umich.edu'), ('dana@umich.edu');
insert into public.admins values ('boss@umich.edu');

-- ===== Anonymous visitor =====
set role anon;
select t.ok(t.count('select * from public.public_profiles') = 0, 'anon can read public_profiles');
select t.ok(t.count('select * from public.public_placements') = 0, 'anon can read public_placements');
select t.throws('select * from public.profiles', 'anon cannot read profiles');
select t.throws('select * from public.placements', 'anon cannot read placements');
select t.throws('select * from public.roster', 'anon cannot read roster');
select t.throws('select * from public.admins', 'anon cannot read admins');
select t.throws('select * from public.board_positions', 'anon cannot read board_positions');
select t.throws($$insert into public.roster values ('x@umich.edu')$$, 'anon cannot write roster');
reset role;

-- ===== Umich account that is NOT on the roster =====
select t.claims('eve@umich.edu', :'eve');
set role authenticated;
select t.ok(public.my_access() = 'none', 'non-roster umich user gets none');
select t.throws(format($$insert into public.profiles (id, full_name) values (%L, 'Eve')$$, :'eve'), 'non-roster user cannot create a profile');
reset role;

-- ===== Roster member: alice =====
select t.claims('alice@umich.edu', :'alice');
set role authenticated;
select t.ok(public.my_access() = 'member', 'roster member gets member');
insert into public.profiles (id, full_name, class_year, school, major, linkedin_url, headshot_path, bio, show_identity, show_placements)
  values (:'alice', 'Alice Sample', 2027, 'Sample School', 'Sample Major', 'https://www.linkedin.com/in/alice-sample', :'alice' || '/a.webp', 'Sample bio', true, true);
select t.ok((select email from public.profiles where id = :'alice') = 'alice@umich.edu', 'email is taken from the sign-in token');
select t.ok(t.affected(format($$update public.profiles set major = 'Changed Major' where id = %L$$, :'alice')) = 1, 'member can update own profile');
insert into public.placements (profile_id, firm, team, kind, year) values (:'alice', 'Sample Firm One', 'Sample Group', 'internship', 2026);
select t.throws($$update public.profiles set linkedin_url = 'http://example.com/in/x' where id = auth.uid()$$, 'bad LinkedIn URL rejected');
select t.throws($$update public.profiles set bio = repeat('x', 401) where id = auth.uid()$$, 'bio over 400 characters rejected');
select t.throws($$update public.profiles set status = 'approved' where id = auth.uid()$$, 'member cannot set approved');
select t.throws($$update public.profiles set review_note = 'hi' where id = auth.uid()$$, 'member cannot set review_note');
select t.throws($$update public.profiles set published = '{"full_name":"Fake"}' where id = auth.uid()$$, 'member cannot set published');
select t.throws($$update public.profiles set approved_at = now() where id = auth.uid()$$, 'member cannot set approved_at');
select t.throws($$update public.profiles set email = 'someone@umich.edu' where id = auth.uid()$$, 'member cannot change email');
select t.throws($$update public.profiles set id = gen_random_uuid() where id = auth.uid()$$, 'member cannot change id');
select t.throws($$update public.profiles set status = 'changes_requested' where id = auth.uid()$$, 'member cannot set changes_requested');
select t.throws($$insert into public.board_positions values (auth.uid(), 'President', 1)$$, 'member cannot write board_positions');
select t.throws($$insert into public.admins values ('alice@umich.edu')$$, 'member cannot add self to admins');
select t.throws($$insert into public.roster values ('friend@umich.edu')$$, 'member cannot write roster');
select t.ok(t.count('select * from public.roster') = 0, 'member cannot read roster');
select t.ok(t.count('select * from public.admins') = 0, 'member cannot read admins');
select t.throws($$select public.approve_profile(auth.uid())$$, 'member cannot call approve_profile');
select t.throws($$select public.request_changes(auth.uid(), 'x')$$, 'member cannot call request_changes');
reset role;

-- ===== Roster member: bob (consents to everything) =====
select t.claims('bob@umich.edu', :'bob');
set role authenticated;
insert into public.profiles (id, full_name, class_year, school, major, linkedin_url, headshot_path, show_identity, show_headshot, show_linkedin, show_placements, show_name_on_placements)
  values (:'bob', 'Bob Sample', 2026, 'Sample School', 'Sample Major', 'https://www.linkedin.com/in/bob-sample', :'bob' || '/b.webp', true, true, true, true, true);
insert into public.placements (profile_id, firm, team, kind, year) values (:'bob', 'Sample Firm Two', null, 'full_time', 2026);
select t.ok(t.count('select * from public.profiles') = 1, 'bob sees only his own profile');
select t.ok(t.count(format($$select * from public.profiles where id = %L$$, :'alice')) = 0, 'bob cannot read alice profile');
select t.ok(t.affected(format($$update public.profiles set full_name = 'Hacked' where id = %L$$, :'alice')) = 0, 'bob cannot update alice profile');
select t.ok(t.affected(format($$delete from public.profiles where id = %L$$, :'alice')) = 0, 'bob cannot delete alice profile');
select t.ok(t.count(format($$select * from public.placements where profile_id = %L$$, :'alice')) = 0, 'bob cannot read alice placements');
select t.throws(format($$insert into public.placements (profile_id, firm, kind) values (%L, 'X', 'internship')$$, :'alice'), 'bob cannot add placements to alice');
reset role;

-- ===== Non-umich addresses =====
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.ok(public.my_access() = 'admin', 'admin gets admin');
select t.throws($$insert into public.roster values ('person@gmail.com')$$, 'non-umich email cannot join roster');
select t.throws($$insert into public.roster values ('Person@umich.edu')$$, 'upper-case email cannot join roster');
select t.throws($$insert into public.admins values ('person@gmail.com')$$, 'non-umich email cannot become admin');
insert into public.roster values ('new.person@umich.edu');
select t.ok(t.count('select * from public.roster') = 4, 'admin can add to and read roster');
select t.ok(t.count('select * from public.profiles') = 2, 'admin can read all profiles');
select t.ok(t.count('select * from public.placements') = 2, 'admin can read all placements');
reset role;
select t.throws($$insert into auth.users (email) values ('person@gmail.com')$$, 'auth.users rejects non-umich sign-up');
select t.throws($$update auth.users set email = 'person@gmail.com' where email = 'eve@umich.edu'$$, 'auth.users rejects change to non-umich email');
select t.throws($$update auth.users set email = 'eve2@umich.edu' where email = 'eve@umich.edu'$$, 'auth.users rejects ANY change of an existing email');
update auth.users set email = 'eve@umich.edu' where email = 'eve@umich.edu';
select t.ok(true, 'auth.users allows updates that keep the email');

-- ===== Tokens that did not come from Google get nothing, even with a roster or admin address =====
select t.claims('alice@umich.edu', :'alice', 'email');
set role authenticated;
select t.ok(public.my_access() = 'none', 'email-provider token with a roster address gets none');
select t.ok(t.count('select * from public.profiles') = 0, 'email-provider token cannot read the roster member profile');
select t.throws(format($$insert into public.profiles (id, full_name) values (%L, 'Imposter')$$, :'dana'), 'email-provider token cannot create a profile');
reset role;
select t.claims('boss@umich.edu', :'boss', 'email');
set role authenticated;
select t.ok(public.my_access() = 'none', 'email-provider token with an admin address gets none');
select t.ok(t.count('select * from public.roster') = 0, 'email-provider admin address cannot read the roster');
select t.throws($$insert into public.roster values ('sneaky@umich.edu')$$, 'email-provider admin address cannot write the roster');
select t.throws(format($$select public.approve_profile(%L)$$, :'alice'), 'email-provider admin address cannot approve');
select t.throws($$insert into public.admins values ('boss@umich.edu')$$, 'email-provider token cannot add admins');
reset role;
select t.claims('eve@gmail.com', :'eve', 'google');
set role authenticated;
select t.ok(public.my_access() = 'none', 'google token with a non-umich address gets none');
reset role;

-- ===== Field limits =====
select t.claims('alice@umich.edu', :'alice');
set role authenticated;
select t.throws($$update public.profiles set headshot_path = '99999999-9999-9999-9999-999999999999/x.webp' where id = auth.uid()$$, 'headshot path outside the member folder is rejected');
select t.throws($$update public.profiles set headshot_path = auth.uid()::text || '/../x.webp' where id = auth.uid()$$, 'headshot path with dots is rejected');
select t.throws($$update public.profiles set full_name = repeat('n', 121) where id = auth.uid()$$, 'over-long name is rejected');
select t.throws($$update public.profiles set class_year = 2014 where id = auth.uid()$$, 'class year below 2015 is rejected');
select t.throws($$update public.profiles set class_year = 2041 where id = auth.uid()$$, 'class year above 2040 is rejected');
select t.throws($$insert into public.placements (profile_id, firm, kind, year) values (auth.uid(), 'X', 'internship', 2010)$$, 'placement year below 2015 is rejected');
select t.throws($$insert into public.placements (profile_id, firm, kind) values (auth.uid(), repeat('f', 121), 'internship')$$, 'over-long firm is rejected');
insert into public.placements (profile_id, firm, kind, year) select auth.uid(), 'Filler ' || g, 'internship', 2025 from generate_series(1, 19) g;
select t.ok((select count(*) from public.placements where profile_id = auth.uid()) = 20, 'a profile can hold 20 placements');
select t.throws($$insert into public.placements (profile_id, firm, kind) values (auth.uid(), 'Twenty-first', 'internship')$$, 'a 21st placement is rejected');
delete from public.placements where firm like 'Filler %';
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.throws(format($$insert into public.board_positions values (%L, repeat('t', 121), 1)$$, :'bob'), 'over-long board title is rejected');
reset role;

-- ===== Admin review, approval and public views =====
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select public.request_changes(:'alice', 'Please add a major.');
select t.ok((select status from public.profiles where id = :'alice') = 'changes_requested' and (select review_note from public.profiles where id = :'alice') = 'Please add a major.', 'admin can request changes with a note');
select public.approve_profile(:'alice');
select public.approve_profile(:'bob');
insert into public.board_positions values (:'alice', 'Sample President', 1);
select t.ok(t.count('select * from public.board_positions') = 1, 'admin can write board_positions');
reset role;

set role anon;
select t.ok(t.count('select * from public.public_profiles') = 2, 'approved profiles appear in public_profiles');
select t.ok((select full_name from public.public_profiles where profile_id = :'alice') = 'Alice Sample', 'consented name is public');
select t.ok((select linkedin_url from public.public_profiles where profile_id = :'alice') is null, 'unconsented LinkedIn is absent');
select t.ok((select headshot_path from public.public_profiles where profile_id = :'alice') is null, 'unconsented headshot is absent');
select t.ok((select board_title from public.public_profiles where profile_id = :'alice') = 'Sample President', 'board title is public');
select t.ok((select linkedin_url from public.public_profiles where profile_id = :'bob') = 'https://www.linkedin.com/in/bob-sample', 'consented LinkedIn is public');
select t.ok((select headshot_path from public.public_profiles where profile_id = :'bob') = :'bob' || '/b.webp', 'consented headshot is public');
select t.ok((select member_name from public.public_placements where firm = 'Sample Firm One') is null, 'placement hides the name without consent');
select t.ok((select member_name from public.public_placements where firm = 'Sample Firm Two') = 'Bob Sample', 'placement shows the name with consent');
select t.ok((select class_year from public.public_placements where firm = 'Sample Firm Two') = 2026, 'placement shows class year with name consent');
select t.ok(not exists (select 1 from information_schema.columns where table_name in ('public_profiles', 'public_placements') and table_schema = 'public' and column_name in ('email', 'status', 'review_note', 'bio', 'published')), 'views have no email/status/note/bio columns');
select t.ok(strpos((select string_agg(p::text, ' ') from public.public_profiles p), '@umich.edu') = 0, 'no email text anywhere in public_profiles');
reset role;

-- ===== Editing after approval keeps the old public snapshot =====
select t.claims('alice@umich.edu', :'alice');
set role authenticated;
update public.profiles set full_name = 'Alice Renamed', status = 'draft' where id = :'alice';
select t.ok((select status from public.profiles where id = :'alice') = 'submitted', 'editing an approved profile sets it back to submitted');
select t.ok(t.count(format($$select * from public.profiles where id = %L and published is not null$$, :'alice')) = 1, 'snapshot kept on the profile');
reset role;
set role anon;
select t.ok((select full_name from public.public_profiles where profile_id = :'alice') = 'Alice Sample', 'public still shows the old snapshot after an edit');
reset role;

-- A placement change on an approved profile also sends it back for review.
select t.claims('bob@umich.edu', :'bob');
set role authenticated;
insert into public.placements (profile_id, firm, kind, year) values (:'bob', 'Sample Firm Three', 'internship', 2025);
select t.ok((select status from public.profiles where id = :'bob') = 'submitted', 'adding a placement sends an approved profile back for review');
reset role;
set role anon;
select t.ok(t.count('select * from public.public_placements where firm = ''Sample Firm Three''') = 0, 'new placement is not public until approved');
reset role;

-- ===== Unpublish =====
select t.claims('bob@umich.edu', :'bob');
set role authenticated;
select public.unpublish_my_profile();
select t.ok((select status from public.profiles where id = :'bob') = 'draft', 'unpublish returns the profile to draft');
reset role;
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'bob')) = 0, 'unpublished member leaves public_profiles');
select t.ok(t.count('select * from public.public_placements where firm = ''Sample Firm Two''') = 0, 'unpublished member leaves public_placements');
reset role;

-- ===== Deleting a profile removes its placements and board position =====
select t.claims('alice@umich.edu', :'alice');
set role authenticated;
select t.ok(t.count('select * from public.board_positions') = 1, 'member can read own board title');
delete from public.profiles where id = :'alice';
reset role;
select t.ok((select count(*) from public.placements where profile_id = :'alice') = 0, 'deleting a profile removes its placements');
select t.ok((select count(*) from public.board_positions where profile_id = :'alice') = 0, 'deleting a profile removes its board position');
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'alice')) = 0, 'deleted member leaves the public views');
reset role;

-- ===== Admin takes a published profile down =====
select t.claims('dana@umich.edu', :'dana');
set role authenticated;
insert into public.profiles (id, full_name, class_year, show_identity, headshot_path) values (:'dana', 'Dana Sample', 2027, true, :'dana' || '/d.webp');
select t.throws(format($$select public.unpublish_profile(%L, 'x')$$, :'dana'), 'member cannot call unpublish_profile');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select public.approve_profile(:'dana');
reset role;
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'dana')) = 1, 'dana is public after approval');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.throws(format($$select public.unpublish_profile(%L, '  ')$$, :'dana'), 'unpublish_profile requires a note');
select public.unpublish_profile(:'dana', 'Please remove the class year.');
select t.ok((select status from public.profiles where id = :'dana') = 'changes_requested' and (select published from public.profiles where id = :'dana') is null and (select review_note from public.profiles where id = :'dana') = 'Please remove the class year.', 'admin unpublish clears the snapshot and records the note');
reset role;
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'dana')) = 0, 'admin-unpublished profile leaves the public views');
reset role;

-- ===== Member who leaves the roster loses access =====
delete from public.roster where email = 'bob@umich.edu';
select t.claims('bob@umich.edu', :'bob');
set role authenticated;
select t.ok(public.my_access() = 'none', 'removed roster member gets none');
select t.ok(t.count('select * from public.profiles') = 0, 'removed roster member cannot read own profile');
reset role;

\echo
select 'ALL PASSED: ' || count(*) || ' assertions' as result from t.results;
