# Go-live steps

Allow an afternoon. Nothing here needs coding, only copy and paste.

**Important:** the University of Michigan may restrict outside apps that use "Sign in with Google" for @umich.edu accounts. We have not confirmed its policy. Before you rely on the members area, test the whole sign-in with a real student account (not a personal Gmail). If it is blocked, the public site still works; only the members area is affected.

1. **Buy the domain.** Buy `michigansustainableinvestments.com` (or your choice) from any registrar. Keep the login in the club's shared password manager.
2. **Create the GitHub repository and turn on Pages.**
   1. Create a new empty repository on GitHub under the club's account and push this folder to it (branch `main`).
   2. Settings > Pages > Source: choose **GitHub Actions**. The ready-made workflow is `.github/workflows/deploy.yml`.
   3. Settings > Secrets and variables > Actions > **Variables**: nothing is needed for the address: the site works out its own address (the free `account.github.io/repository/` address, or your own domain once you add one). Add the two Supabase values in step 3 below.
   4. Custom domain: in Settings > Pages enter your domain, then add the DNS records GitHub shows at your registrar.
   5. The site rebuilds on every push, by hand (Actions > Deploy site > Run workflow), and every 6 hours, so approved profiles appear without anyone touching code.
3. **Create the Supabase project.**
   1. Sign up at supabase.com, create a project (free plan is enough), pick a strong database password and store it.
   2. SQL Editor > New query: paste all of `supabase/01_core.sql` and Run. Then do the same with `supabase/02_storage.sql`. Both are safe to run again.
   3. Project settings > API: copy the **Project URL** and the **anon public key**. Put them in the GitHub variables `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`. (The anon key is meant to be public; the database rules protect the data.)
4. **Create the Google sign-in client.**
   1. Go to console.cloud.google.com, create a project named for the club.
   2. APIs and Services > OAuth consent screen: User type **External**. Fill the app name and a support email. Scopes: only `openid`, `email`, `profile`.
   3. Credentials > Create credentials > OAuth client ID > Web application. Under **Authorized redirect URIs** paste the callback URL shown in Supabase at Authentication > Providers > Google (it looks like `https://<project>.supabase.co/auth/v1/callback`).
   4. Copy the Client ID and Client secret. In Supabase: Authentication > Providers > Google, switch it on and paste both.
5. **Set the Supabase auth settings.**
   - Authentication > Providers: leave **only Google** on. Turn **email sign-ups off** and keep **confirm email on**.
   - Authentication > URL configuration: set **Site URL** to your site address, and add `https://<your site>/members/profile/` (with your `BASE_PATH` if any) under Redirect URLs.
6. **Add the first admin.** In the SQL Editor run (use your own umich address, all lower case):
   `insert into public.admins (email) values ('your.uniqname@umich.edu');`
   Admins can then sign in and manage everything from the Board admin page.
7. **Add roster emails (optional).** You do not need members' emails in advance. Anyone with an @umich.edu Google account can sign in and create a profile themselves. If you already have a list, open Board admin > Roster and paste it; those people are then confirmed members from the start.
   The database itself enforces who gets in: it accepts only Google sign-ins from @umich.edu addresses. An account created any other way, even with a roster or admin address, gets no access. Nothing a person writes is public, and they do not count as a member, until the board approves their profile.
8. **Approve new members.** Open Board admin > **Review**. Each new profile shows the person's email, with a **New** badge if they are not on the roster yet. Read it, then press **Approve** (the profile can appear on the site at the next rebuild, and the person is added to the roster automatically), **Request changes** (write a note), or **Delete** (removes the profile for good). Do this regularly; people see "Waiting for board approval" until you do.
9. **Keep the free Supabase project awake.** Free projects pause after about a week with no activity. The 6-hourly site rebuild reads the database each time, which counts as activity, so keep that schedule on. If the project ever pauses, open it in the Supabase dashboard and press Restore.
10. **Assign board titles.** Sign in, open Board admin > **Board titles**, type each person's title and a display order number (1 is shown first), then press Save. People appear in "Executive board" on the Team page at the next rebuild. Clear the title to move them back to "Members". Members cannot change their own title.
11. **Take a profile down.** Open Board admin > **Review**. The "Published" list under the review queue shows every profile that is live. Write a short note and press **Unpublish**. The profile goes back to the member as "Changes requested" with your note, and leaves the public site at the next rebuild (run the Deploy workflow by hand to make it immediate).
12. **Hand over to next year's board.**
   - Add the new admins with the SQL line in step 6; remove old ones with `delete from public.admins where email = '...';`.
   - Transfer ownership (or add the new president as owner) of the GitHub repository, the Supabase project, the Google Cloud project and the domain registrar. Update the shared password manager.
   - Update `src/data/club.ts` (contact email, application dates) and the board titles in Board admin.
