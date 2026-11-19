# Before launch

## Lines the board must confirm
These sentences are used on the site but were drafted from the club's public description. Check each one, then edit it in the file shown. Facts that live in `src/data/club.ts` are changed there.

| # | Sentence | File |
|---|----------|------|
| 1 | Dues: "$25 per semester" (Recruitment FAQ, llms.txt) | `src/data/club.ts` (`dues`) |
| 2 | "Members apply the material in team projects and present their work to the club." | `src/pages/who-we-are.astro` |
| 3 | "Sessions cover finance recruiting: building a résumé, networking and interviewing." | `src/pages/who-we-are.astro` |
| 4 | "Sustainable finance is now a line of business at banks, asset managers and funds. Members use MSI to prepare for roles in:" and the four roles listed under it | `src/pages/placements.astro` |
| 5 | Contact email for the VP of External (optional once the contact form is on) | `src/data/club.ts` (`contactEmail`) |

The Who We Are page description fits the 165-character limit the site tests enforce.

## Also do
- [ ] Contact email: set `contactEmail` in `src/data/club.ts`. Until then the Privacy page says "Contact details will be posted here." (or points to the contact form, once that is on).
- [ ] Confirm the firm list on the Placements page (`src/data/firms.ts`). The board must agree that every firm and logo belongs there.
- [ ] Run `supabase/03_contact.sql` to switch on the contact form (see step 3 in `docs/SETUP.md`). Until it is run, the site has no Contact page and the home page shows Member sign-in as its second button.
- [ ] Social links: fill `social` in `src/data/club.ts`. Empty ones are hidden.
- [ ] Selectivity line (optional): set `selectivity` in `src/data/club.ts` (term, applied, admitted) to show "In {term}, {applied} students applied and {admitted} were admitted." on the Recruitment and home pages. It stays hidden until all three are set.
- [ ] Application dates: set `application` in `src/data/club.ts` (state, opens, closes, applyUrl).
- [ ] Replace the two placeholder photos (see README). The current ones are stock photos of people who are not MSI members.
- [ ] Privacy page review: read `src/pages/privacy.astro` against how the club really handles data; have the faculty advisor or Student Life check it.
- [ ] Test Google sign-in with a real student account (see the warning at the top of `docs/SETUP.md`).
- [ ] Make the site findable: the site is in SOFT LAUNCH (every page asks search engines not to list it). When the wording above is confirmed, set `searchVisible: true` in `src/data/club.ts`.
