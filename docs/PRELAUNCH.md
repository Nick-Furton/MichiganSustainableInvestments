# Before launch

## Lines the board must confirm
These sentences are used on the site but were drafted from the club's public description. Check each one, then edit it in the file shown. Facts that live in `src/data/club.ts` are changed there.

| # | Sentence | File |
|---|----------|------|
| 1 | "Members apply the material in team projects and present their conclusions." | `src/pages/index.astro` |
| 2 | "Sessions prepare members for finance recruiting, from résumés to interviews." | `src/pages/index.astro` |
| 3 | Dues: "$25 per semester" (Recruitment FAQ, llms.txt) | `src/data/club.ts` (`dues`) |
| 4 | "Members apply the material in team projects and present their work to the club." | `src/pages/who-we-are.astro` |
| 5 | "Sessions cover finance recruiting: building a résumé, networking and interviewing." | `src/pages/who-we-are.astro` |
| 6 | "Sustainable finance is now a line of business at banks, asset managers and funds. Members use MSI to prepare for roles in:" and the four roles listed under it | `src/pages/placements.astro` |
| 7 | Contact email for the VP of External (required before launch) | `src/data/club.ts` (`contactEmail`) |

The Who We Are page description fits the 165-character limit the site tests enforce.

## Also do
- [ ] Contact email: set `contactEmail` in `src/data/club.ts`. Until then the Who We Are and Privacy pages say "Contact details will be posted here."
- [ ] Social links: fill `social` in `src/data/club.ts`. Empty ones are hidden.
- [ ] Selectivity line (optional): set `selectivity` in `src/data/club.ts` (term, applied, admitted) to show "In {term}, {applied} students applied and {admitted} were admitted." on the Recruitment and home pages. It stays hidden until all three are set.
- [ ] Application dates: set `application` in `src/data/club.ts` (state, opens, closes, applyUrl).
- [ ] Replace the two placeholder photos (see README). The current ones are stock photos of people who are not MSI members.
- [ ] Privacy page review: read `src/pages/privacy.astro` against how the club really handles data; have the faculty advisor or Student Life check it.
- [ ] Test Google sign-in with a real student account (see the warning at the top of `docs/SETUP.md`).
- [ ] Make the site findable: the site is in SOFT LAUNCH (every page asks search engines not to list it). When the wording above is confirmed, set `searchVisible: true` in `src/data/club.ts`.
