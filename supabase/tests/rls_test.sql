-- Database tests. Any failed assertion raises an error; psql runs with ON_ERROR_STOP so the run exits non-zero.
\set ON_ERROR_STOP 1
\set QUIET 1
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set eve   '33333333-3333-3333-3333-333333333333'
\set boss  '44444444-4444-4444-4444-444444444444'
\set dana  '55555555-5555-5555-5555-555555555555'
\set gus   '66666666-6666-6666-6666-666666666666'

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
  (:'alice', 'alice@umich.edu'), (:'bob', 'bob@umich.edu'), (:'eve', 'eve@umich.edu'), (:'boss', 'boss@umich.edu'), (:'dana', 'dana@umich.edu'), (:'gus', 'gus@umich.edu');
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

-- ===== Umich Google account that is NOT on the roster is an applicant =====
select t.claims('eve@umich.edu', :'eve');
set role authenticated;
select t.ok(public.my_access() = 'applicant', 'non-roster umich google user gets applicant');
select t.ok(t.count('select * from public.roster') = 0, 'applicant cannot read the roster');
select t.ok(t.count('select * from public.admins') = 0, 'applicant cannot read admins');
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

-- ===== Self-signup: applicant creates a profile, the board approves, the applicant becomes a member =====
select t.claims('gus@umich.edu', :'gus');
set role authenticated;
select t.ok(public.my_access() = 'applicant', 'new umich google user is an applicant');
insert into public.profiles (id, full_name, class_year, school, major, show_identity, show_placements)
  values (:'gus', 'Gus Sample', 2028, 'Sample School', 'Sample Major', true, true);
select t.ok((select email from public.profiles where id = :'gus') = 'gus@umich.edu', 'applicant profile email comes from the token');
insert into public.placements (profile_id, firm, kind, year) values (:'gus', 'Sample Firm Nine', 'internship', 2026);
select t.ok(t.affected(format($$update public.profiles set major = 'New Major', status = 'submitted' where id = %L$$, :'gus')) = 1, 'applicant can edit and submit their own profile');
select t.ok(t.count('select * from public.profiles') = 1, 'applicant sees only their own profile');
select t.ok(t.count(format($$select * from public.profiles where id = %L$$, :'bob')) = 0, 'applicant cannot read another profile');
select t.ok(t.affected(format($$update public.profiles set full_name = 'Hacked' where id = %L$$, :'bob')) = 0, 'applicant cannot update another profile');
select t.ok(t.affected(format($$delete from public.profiles where id = %L$$, :'bob')) = 0, 'applicant cannot delete another profile');
select t.ok(t.count('select * from public.roster') = 0, 'applicant still cannot read the roster');
select t.throws($$insert into public.roster values ('gus@umich.edu')$$, 'applicant cannot add self to the roster');
select t.throws($$insert into public.admins values ('gus@umich.edu')$$, 'applicant cannot add self to admins');
select t.throws($$insert into public.board_positions values (auth.uid(), 'President', 1)$$, 'applicant cannot write board_positions');
select t.throws($$update public.profiles set status = 'approved' where id = auth.uid()$$, 'applicant cannot set approved');
select t.throws($$select public.approve_profile(auth.uid())$$, 'applicant cannot approve');
select t.throws($$select public.delete_profile(auth.uid())$$, 'non-admin cannot call delete_profile');
reset role;
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'gus')) = 0, 'a submitted applicant is not public');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.ok(t.count($$select * from public.roster where email = 'gus@umich.edu'$$) = 0, 'applicant is not on the roster before approval');
select public.approve_profile(:'gus');
select t.ok(t.count($$select * from public.roster where email = 'gus@umich.edu'$$) = 1, 'approval adds the email to the roster');
select t.ok(t.count($$select * from public.roster where email = 'dana@umich.edu'$$) = 1, 'approval of an existing member keeps one roster row');
insert into public.board_positions values (:'gus', 'Sample Treasurer', 5);
reset role;
select t.claims('gus@umich.edu', :'gus');
set role authenticated;
select t.ok(public.my_access() = 'member', 'approved applicant is now a member');
reset role;
select t.claims('gus@umich.edu', :'gus', 'email');
set role authenticated;
select t.ok(public.my_access() = 'none', 'email-provider token for an approved member still gets none');
reset role;
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'gus')) = 1, 'approved applicant is public');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select public.delete_profile(:'gus');
reset role;
select t.ok((select count(*) from public.profiles where id = :'gus') = 0, 'admin delete removes the profile');
select t.ok((select count(*) from public.placements where profile_id = :'gus') = 0, 'admin delete removes the placements');
select t.ok((select count(*) from public.board_positions where profile_id = :'gus') = 0, 'admin delete removes the board position');
set role anon;
select t.ok(t.count(format($$select * from public.public_profiles where profile_id = %L$$, :'gus')) = 0, 'deleted person leaves the public views');
select t.ok(t.count('select * from public.public_placements where firm = ''Sample Firm Nine''') = 0, 'deleted person placements leave the public views');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.throws(format($$select public.delete_profile(%L)$$, :'gus'), 'delete_profile on a missing profile fails');
reset role;

-- ===== Headshot storage rules =====
select t.claims('gus@umich.edu', :'gus');
set role authenticated;
insert into storage.objects (bucket_id, name) values ('headshots', :'gus' || '/one.webp');
select t.throws(format($$insert into storage.objects (bucket_id, name) values ('headshots', %L)$$, :'bob' || '/x.webp'), 'cannot upload into another folder');
select t.throws($$insert into storage.objects (bucket_id, name) values ('other', auth.uid()::text || '/x.webp')$$, 'cannot upload into another bucket');
insert into storage.objects (bucket_id, name) select 'headshots', :'gus' || '/f' || g || '.webp' from generate_series(2, 5) g;
select t.ok(public.my_headshot_count() = 5, 'a member can hold 5 headshot files');
select t.throws(format($$insert into storage.objects (bucket_id, name) values ('headshots', %L)$$, :'gus' || '/six.webp'), 'a 6th headshot file is rejected');
select t.ok(t.affected(format($$delete from storage.objects where name = %L$$, :'gus' || '/f5.webp')) = 1, 'member can delete a file in their own folder');
reset role;
insert into storage.objects (bucket_id, name) values ('headshots', :'bob' || '/b.webp');
select t.claims('gus@umich.edu', :'gus');
set role authenticated;
select t.ok(t.affected(format($$delete from storage.objects where name = %L$$, :'bob' || '/b.webp')) = 0, 'member cannot delete another folder file');
select t.ok(t.count(format($$select * from storage.objects where name like %L$$, :'bob' || '/%')) = 0, 'member cannot list another folder');
reset role;
select t.claims('gus@umich.edu', :'gus', 'email');
set role authenticated;
select t.throws(format($$insert into storage.objects (bucket_id, name) values ('headshots', %L)$$, :'gus' || '/e.webp'), 'email-provider token cannot upload');
reset role;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.ok(t.count('select * from storage.objects') = 5, 'admin can list any headshot');
select t.ok(t.affected($$delete from storage.objects where name like '55555555%' or name like '66666666%' or name like '22222222%'$$) = 5, 'admin can delete any headshot');
reset role;

-- ===== A removed roster member is an applicant again and keeps their own profile =====
delete from public.roster where email = 'bob@umich.edu';
select t.claims('bob@umich.edu', :'bob');
set role authenticated;
select t.ok(public.my_access() = 'applicant', 'removed roster member becomes an applicant');
select t.ok(t.count('select * from public.profiles') = 1, 'removed roster member can still read their own profile');
reset role;

-- ===== Contact form (03_contact.sql) =====
-- A visitor (not signed in) can send a message through the one function, and nothing else.
set role anon;
select t.ok(public.contact_form_ready(), 'anon can ask whether the contact form is ready');
select public.send_contact_message('  Pat   Recruiter ', ' Pat@Example.COM ', ' Example Bank ', 'recruiting', '  We would like to meet your members.  ');
select t.throws('select * from public.contact_messages', 'anon cannot read contact messages');
select t.throws($$insert into public.contact_messages (name, email, topic, message) values ('x', 'x@example.com', 'other', 'direct insert attempt')$$, 'anon cannot insert a contact message directly');
select t.throws($$update public.contact_messages set message = 'changed by a visitor'$$, 'anon cannot update contact messages');
select t.throws('delete from public.contact_messages', 'anon cannot delete contact messages');
select t.throws($$select public.set_contact_handled('00000000-0000-0000-0000-000000000000', true)$$, 'anon cannot mark a message handled');
select t.throws($$select public.send_contact_message('', 'a@example.com', '', 'other', 'A message that is long enough.')$$, 'contact: empty name is refused');
select t.throws($$select public.send_contact_message(repeat('n', 121), 'a@example.com', '', 'other', 'A message that is long enough.')$$, 'contact: over-long name is refused');
select t.throws($$select public.send_contact_message('A', 'not-an-email', '', 'other', 'A message that is long enough.')$$, 'contact: bad email is refused');
select t.throws($$select public.send_contact_message('A', 'a b@example.com', '', 'other', 'A message that is long enough.')$$, 'contact: email with a space is refused');
select t.throws($$select public.send_contact_message('A', null, '', 'other', 'A message that is long enough.')$$, 'contact: missing email is refused');
select t.throws($$select public.send_contact_message('A', 'a@example.com', repeat('o', 161), 'other', 'A message that is long enough.')$$, 'contact: over-long organization is refused');
select t.throws($$select public.send_contact_message('A', 'a@example.com', '', 'admin', 'A message that is long enough.')$$, 'contact: unknown topic is refused');
select t.throws($$select public.send_contact_message('A', 'a@example.com', '', 'other', 'too short')$$, 'contact: too-short message is refused');
select t.throws($$select public.send_contact_message('A', 'a@example.com', '', 'other', repeat('m', 4001))$$, 'contact: over-long message is refused');
select public.send_contact_message('Robot', 'robot@example.com', '', 'other', 'A message from a robot that filled the hidden field.', 'http://spam.example');
reset role;
select t.ok((select count(*) from public.contact_messages) = 1, 'contact: only the valid message was stored (refused and trapped ones were not)');
select t.ok((select name = 'Pat Recruiter' and email = 'pat@example.com' and organization = 'Example Bank' and topic = 'recruiting'
                and message = 'We would like to meet your members.' and handled_at is null and handled_by is null
             from public.contact_messages), 'contact: the message is stored trimmed, with a lower-case email, unhandled');

-- One sender: three messages a day, then refused. An older message does not count.
set role anon;
select public.send_contact_message('Pat', 'pat@example.com', '', 'other', 'Second message from the same sender.');
select public.send_contact_message('Pat', 'PAT@example.com', '', 'other', 'Third message from the same sender.');
select t.throws($$select public.send_contact_message('Pat', 'pat@example.com', '', 'other', 'Fourth message from the same sender.')$$, 'contact: a fourth message in a day from one sender is refused');
reset role;
update public.contact_messages set created_at = now() - interval '2 days' where message like 'Second%';
set role anon;
select public.send_contact_message('Pat', 'pat@example.com', '', 'other', 'Allowed again once an old message ages out.');
reset role;
select t.ok((select count(*) from public.contact_messages) = 4, 'contact: the per-sender limit only counts the last day');

-- Everyone together: 20 an hour.
insert into public.contact_messages (name, email, topic, message)
  select 'Filler', 'filler' || g || '@example.com', 'other', 'Filler message number ' || g from generate_series(1, 17) g;
set role anon;
select t.throws($$select public.send_contact_message('New', 'new@example.com', '', 'other', 'One more than the hourly limit allows.')$$, 'contact: the hourly limit refuses the 21st message');
reset role;
update public.contact_messages set created_at = now() - interval '3 hours';
set role anon;
select public.send_contact_message('New', 'new@example.com', '', 'other', 'Accepted once the hour has passed.');
reset role;
select t.ok((select count(*) from public.contact_messages) = 22, 'contact: the hourly limit only counts the last hour');

-- At most 500 messages waiting for the board.
insert into public.contact_messages (name, email, topic, message, created_at)
  select 'Old', 'old' || g || '@example.com', 'other', 'Old waiting message ' || g, now() - interval '5 days' from generate_series(1, 478) g;
set role anon;
select t.throws($$select public.send_contact_message('Late', 'late@example.com', '', 'other', 'The inbox already holds five hundred.')$$, 'contact: a full inbox refuses new messages');
reset role;
delete from public.contact_messages where name in ('Old', 'Filler');
select t.ok((select count(*) from public.contact_messages) = 5, 'contact: fixtures cleaned up');

-- A member and an applicant see nothing and can change nothing.
select t.claims('alice@umich.edu', :'alice');
set role authenticated;
select t.ok(t.count('select * from public.contact_messages') = 0, 'member cannot read contact messages');
select t.ok(t.affected('delete from public.contact_messages') = 0, 'member cannot delete contact messages');
select t.throws($$update public.contact_messages set message = 'changed by a member'$$, 'member cannot update contact messages');
select t.throws($$insert into public.contact_messages (name, email, topic, message) values ('x', 'x@example.com', 'other', 'direct insert attempt')$$, 'member cannot insert a contact message directly');
select t.throws(format('select public.set_contact_handled(%L, true)', (select id from public.contact_messages limit 1)), 'member cannot mark a message handled');
reset role;
select t.claims('eve@umich.edu', :'eve');
set role authenticated;
select t.ok(t.count('select * from public.contact_messages') = 0, 'applicant cannot read contact messages');
select t.ok(public.contact_form_ready(), 'a signed-in user can also ask whether the contact form is ready');
reset role;
-- A token that claims the admin's address but did not come from Google is nobody.
select t.claims('boss@umich.edu', :'boss', 'email');
set role authenticated;
select t.ok(t.count('select * from public.contact_messages') = 0, 'email-provider token cannot read contact messages');
reset role;
select t.ok((select count(*) from public.contact_messages) = 5, 'contact: nothing was deleted by non-admins');

-- The board reads, marks handled, reopens and deletes.
create table t.msg as select id from public.contact_messages where message like 'We would like%';
grant select on t.msg to public;
select t.claims('boss@umich.edu', :'boss');
set role authenticated;
select t.ok(t.count('select * from public.contact_messages') = 5, 'admin can read contact messages');
select t.throws($$update public.contact_messages set message = 'changed by an admin'$$, 'admin cannot edit a message');
select public.set_contact_handled((select id from t.msg), true);
select t.ok((select handled_at is not null and handled_by = 'boss@umich.edu' from public.contact_messages where id = (select id from t.msg)), 'admin can mark a message handled, and it records who did');
select public.set_contact_handled((select id from t.msg), false);
select t.ok((select handled_at is null and handled_by is null from public.contact_messages where id = (select id from t.msg)), 'admin can reopen a message');
select t.throws($$select public.set_contact_handled('00000000-0000-0000-0000-000000000000', true)$$, 'marking a message that does not exist fails');
select t.ok(t.affected(format('delete from public.contact_messages where id = %L', (select id from t.msg))) = 1, 'admin can delete a message');
select t.ok(t.count('select * from public.contact_messages') = 4, 'the deleted message is gone');
reset role;

\echo
select 'ALL PASSED: ' || count(*) || ' assertions' as result from t.results;
