# MSI website — content spec

Wording below is final unless a line ends with `[CONFIRM]`. `[CONFIRM]` lines are drafted from the club's
public description and must be checked by the board before launch (they are collected in `docs/PRELAUNCH.md`).
Facts live in ONE file (`src/data/club.ts`) so the board can change them without touching page code.

## Voice rules (apply to every string on the site)

- Short, present-tense sentences. One checkable fact per sentence where possible.
- No invented numbers, placements, rankings or superlatives. If a fact is unknown, leave the element out.
- Never use: empower, unlock, elevate, journey, vibrant, passionate, delve, foster, comprehensive, cutting-edge,
  world-class, "not just X but Y". No exclamation marks.
- Always "Michigan Sustainable Investments (MSI)" on first mention per page; never "MSI" alone in a title tag.
- The University is named only after the club name ("… at the University of Michigan"). No Block M, no U-M logo.

## Global

- Site name: `Michigan Sustainable Investments`
- Descriptor: `The sustainable investing club at the University of Michigan.`
- Nav: Home · Sustainable investing · Program · Board · Placements* · Join · For employers — plus buttons `Member sign-in` and `Apply`.
  (*Placements appears in the nav only when at least one approved entry exists. Board is always shown.)
- Footer disclaimer (every page): `Michigan Sustainable Investments is a student organization at the University of Michigan. It is not an official unit of the University and does not speak for it. Nothing on this site is investment advice.`
- Footer history line: `Founded in 2019 as the Michigan Impact Investing Symposium.`
- Footer links: all nav pages, `Résumé and LinkedIn guide`, `Privacy`.
- Placeholder photo alt text: `A presenter in a dark suit points to a slide while an audience looks on.` (No caption. Never describe the people as MSI members.)

## Home (`/`)

- Title: `Michigan Sustainable Investments (MSI) | University of Michigan`
- Description: `Michigan Sustainable Investments (MSI) is the student-run sustainable investing club at the University of Michigan. Founded in 2019. Membership by application.`
- Eyebrow: `University of Michigan · Founded 2019`
- H1: `Michigan's sustainable investing club`
- Lead: `Michigan Sustainable Investments (MSI) is a student-run finance club at the University of Michigan. Members learn to evaluate investments on financial return and on environmental and social impact, and prepare for careers in investment banking, asset management and impact investing. Since 2019, the club has brought speakers from firms including Goldman Sachs and Impact Engine to campus.`
- Buttons: `Apply` → /join · `See the program` → /program. Small link under them: `Members: sign in to update your profile →` → /members
- Hero photo: placeholder `presenting-hero.jpg` (portrait, right side).

**H2: What members do** — intro: `The program has four parts.`
1. `Investing education` — `Modules teach how investors evaluate a deal for financial return and for impact. Topics run from public equities and green bonds to venture capital and microfinance.`
2. `Hands-on projects` — `Members apply the material in team projects and present their conclusions.` [CONFIRM]
3. `Professional development` — `Sessions prepare members for finance recruiting, from résumés to interviews.` [CONFIRM]
4. `Speakers and the Symposium` — `The club hosts investors and operators on campus. Five symposia have been held since 2019.`
Links: `Read about the program →` → /program · `The five kinds of investment members study →` → /sustainable-investing/

**H2: Sustainable finance is a way into banking**
- Paragraph: `Banks, asset managers and funds now staff teams built around the energy transition. MSI members study the instruments those teams use: green bonds, public equities, clean-energy project finance and venture capital.`
- List heading: `Where the work happens`
  - `Energy transition and renewables investment banking`
  - `Power and utilities coverage`
  - `Sustainable finance and green bond desks`
  - `ESG research and asset management`
  - `Impact investing and climate venture capital`
- Link: `How the program prepares members →` → /program#careers

**H2: Who has spoken at MSI**
- Line: `Symposium speakers from 2019 to 2024 have come from:`
- Plain-text list (no logos): `Goldman Sachs` · `Pfizer` · `Orrick` · `Impact Engine` · `Total Impact Capital`
- Small note: `Affiliations as listed in symposium programs. Naming a firm does not imply sponsorship or endorsement.`

**H2: Leadership** (only when approved board profiles exist) — line: `The executive board.` — up to 6 cards — link `Meet the board →` → /board/

**H2: Where members go** (only when approved placements exist) — line: `Offers accepted by members, self-reported.` — up to 8 entries — link `All placements →`

**Closing band — H2: Join MSI** — `Membership is by application. Dates for the next cycle are posted on the Join page.` — button `How to apply` → /join. When selectivity is set in `club.ts`, a line under it: `In {term}, {applied} students applied and {admitted} were admitted.` (hidden otherwise)

## Program (`/program`)

- Title: `Program | Michigan Sustainable Investments`
- Description: `What members of Michigan Sustainable Investments (MSI) do: investing education, team projects, professional development, and a symposium with speakers from firms including Goldman Sachs.`
- H1: `The program`
- Lead: `MSI members learn how sustainable investments are sourced, valued and judged. The program has four parts.`
- Photo: placeholder `presenting-wide.jpg`.
- H2 `Investing education` — `Modules cover how investors evaluate a deal for financial return and for impact. Members work through the main instruments: public equities screened on environmental, social and governance factors; green bonds; venture capital for mission-driven companies; microfinance; and clean-energy project finance.`
- H2 `Hands-on projects` — `Members apply the material in team projects and present their work to the club.` [CONFIRM]
- H2 `Professional development` — `Sessions cover finance recruiting: building a résumé, networking and interviewing.` [CONFIRM]
- H2 `Speakers and the Symposium` — `MSI hosts practitioners on campus. Its flagship event, founded as the Michigan Impact Investing Symposium, ran five times between 2019 and 2024. Speakers have come from Goldman Sachs, Pfizer, Orrick, Impact Engine and Total Impact Capital.`
- H2 `Careers this prepares you for` (id `careers`) — intro: `Sustainable finance is now a line of business at banks, asset managers and funds. Members use MSI to prepare for roles in:` [CONFIRM]
  - `Investment banking.` `Energy transition, renewables, and power and utilities groups advise on and finance the build-out of clean power.`
  - `Sustainable finance and capital markets.` `Desks that structure green and sustainability-linked bonds.`
  - `Asset management and research.` `Funds and analysts that weigh environmental, social and governance factors in public markets.`
  - `Impact investing and venture capital.` `Funds that back companies with a measurable social or environmental goal.`
- When placements exist: link `See where members have gone →` → /placements

## Board (`/board`)

- Title: `Board | Michigan Sustainable Investments`
- Description: `The executive board of Michigan Sustainable Investments (MSI) at the University of Michigan.`
- H1: `Board`
- Lead: `MSI is run by its executive board. Each member writes their own profile, and the board approves it before it appears here.`
- Always in the nav and footer. H2 `Executive board`: approved profiles that have a board title, in display order. H2 `Members`: approved profiles without a title, only when there are any. Cards: headshot, name, board title, class year, school/major, LinkedIn link. Board titles and order are set by an administrator, never by the member.
- Empty state (no approved profiles): `Board profiles are being added. Members can sign in to add theirs.` + link `Member sign-in →`. While empty the page is `noindex` and out of the sitemap.

## Types of sustainable investment (`/sustainable-investing`)

Second item in the nav (label `Sustainable investing`), also in the footer and llms.txt. The full copy is in `src/pages/sustainable-investing.astro`.

- Title: `Types of sustainable investment | Michigan Sustainable Investments`
- Description: `How five kinds of sustainable investment work and what each one finances: microfinance, impact venture capital, green bonds, ESG equities and clean-energy finance.`
- H1: `Types of sustainable investment`. A short in-page list links to five H2 sections (`microfinance`, `impact-venture-capital`, `green-bonds`, `esg-equities`, `clean-energy-finance`). Each has four labelled parts: `How it works`, `How investors are paid`, `What it does`, `What members examine`. Microfinance and Green bonds also end with an `On record` line.
- H2 `Where this leads` (link `See the careers MSI prepares members for →` → /program#careers) and H2 `Sources` (Nobel Prize 2006 summary, Green Bond Principles at ICMA, World Bank green bonds).

## Placements (`/placements`)

- Title: `Placements | Michigan Sustainable Investments`
- Description: `Internship and full-time offers accepted by members of Michigan Sustainable Investments (MSI), self-reported and listed by year.`
- H1: `Placements`
- Lead: `Internship and full-time offers accepted by MSI members. Members report their own placements, and the board approves each entry before it is listed.`
- Grouped by year, newest first. Each row, plain text: firm · group or team · `Internship` or `Full-time` · member name (only if that member consented to show it) · class year.
- Footnote: `Updated {Month YYYY}. Firm names identify employers only and do not imply sponsorship or endorsement.`
- Empty state: `MSI publishes placements as members report them. None have been approved for publication yet.`

## Join (`/join`)

- Title: `Join | Michigan Sustainable Investments`
- Description: `How to join Michigan Sustainable Investments (MSI) at the University of Michigan. Membership is by application. Dates, dues and common questions.`
- H1: `Join MSI`
- Lead: `Membership is by application.`
- Under the lead, when `selectivity` is set in `club.ts`: `In {term}, {applied} students applied and {admitted} were admitted.` (hidden otherwise)
- Status block, driven by `club.ts`:
  - open: `Applications are open until {closes}.` + button `Apply now` → application link
  - scheduled: `Applications open {opens}.`
  - default (no dates set): `The next application cycle has not been announced. Dates will be posted here.`
- H2 `Common questions` (visible on the page, plain HTML, each question an H3)
  - `What is Michigan Sustainable Investments?` — `MSI is the student-run sustainable investing club at the University of Michigan, founded in 2019.`
  - `Is MSI part of the University of Michigan?` — `MSI is a student organization at the University of Michigan. It is run by students and is not an official unit of the University.`
  - `What was the Michigan Impact Investing Symposium?` — `It is the name the club was founded under in 2019. The club became Michigan Sustainable Investments in 2024. The symposium was held five times between 2019 and 2024.`
  - `How much are dues?` — `$25 per semester.` [CONFIRM]
  - `How do I apply?` — `Through the application posted on this page when a cycle opens.`
  - `How do members get listed on the Board and Placements pages?` — `Members sign in with their University of Michigan account, fill in a profile and choose what to publish. The board approves each profile before it appears.`

## For employers (`/employers`)

- Title: `For employers | Michigan Sustainable Investments`
- Description: `Speak at Michigan Sustainable Investments (MSI), meet members, or support the symposium. Contact the club's external team at the University of Michigan.`
- H1: `For employers and speakers`
- Lead: `MSI connects firms working in sustainable finance with University of Michigan undergraduates who study it.`
- Three blocks (H2 each):
  - `Speak to members` — `Lead a session on your team's work. Past speakers have come from Goldman Sachs, Pfizer, Orrick, Impact Engine and Total Impact Capital.`
  - `Meet members` — `Host a coffee chat, an office visit or a recruiting session.`
  - `Support the symposium` — `Sponsor the club's flagship event or join a panel.`
- H2 `Contact` — `Write to the VP of External at {contactEmail}.` (If `contactEmail` is empty, show: `Contact details will be posted here.`) [CONFIRM: contact email required before launch]

## Résumé and LinkedIn guide (`/members/resume-guide`, public)

- Title: `How to list MSI on your résumé and LinkedIn | Michigan Sustainable Investments`
- Description: `The exact name, format and wording members of Michigan Sustainable Investments (MSI) should use on résumés and LinkedIn.`
- H1: `How to list MSI on your résumé and LinkedIn`
- Lead: `Use the same name everywhere. Recruiters, and the software that screens résumés, match on exact text.`
- H2 `The name` — `Michigan Sustainable Investments (MSI), University of Michigan` (shown as a copyable block). Then: `Write it out in full. "MSI" alone is ambiguous: at Michigan it also means a School of Information degree.`
- H2 `On your résumé` — a template block:
  ```
  Michigan Sustainable Investments (MSI), University of Michigan        [Start] – [End]
  [Your title]
  • [What you analyzed or built, with a number]
  • [What you presented, and to whom]
  • [What you led or organized, with its size]
  ```
  Then three rules: `Start each bullet with what you did.` `Put one number in each bullet.` `Name the instrument or sector you worked on.`
- H2 `On LinkedIn` — `Add MSI under Experience and choose the club's LinkedIn page from the list, so the entry links to MSI.` `Use your exact title. Board titles are set by the club.`
- H2 `One-line description` — `If you have room, add: "Student-run sustainable investing club at the University of Michigan, founded 2019."`
- H2 `What to avoid` — `A title you did not hold.` `Numbers you cannot explain in an interview.` `Abbreviating the club's name.`
(The bracketed template text on this page is intentional and is the only place square brackets may appear in output.)

## Members area (not indexed: `noindex`)

- `/members` — H1 `Member sign-in` — `Sign in with your University of Michigan Google account to create or update your profile.` — button `Sign in with Google` — note: `Use your @umich.edu Google account. New members can create a profile right away. The board approves every profile before it appears on the site.`
- States: not configured → `Member sign-in is not switched on yet.` · wrong domain → `Use your @umich.edu account.` · applicant (signed in, not on the roster yet) → the profile form with the line `Fill in your profile and submit it. The board reviews it before anything appears on the site.` There is no "not on the roster" state: anyone with an @umich.edu Google account can create a profile, and approval by the board makes them a member.
- `/members/profile` — H1 `Your profile` — fields: full name; class year; school; major; LinkedIn URL; headshot; short bio (max 400 characters); placements (firm, group or team, internship or full-time, year). Board title is shown read-only with the note `Set by the board.`
- Consent heading `Choose what appears on the public site` — checkboxes: `My name, class year and program` · `My headshot` · `My LinkedIn link` · `My placements` · `My name next to my placements`. Note: `Nothing appears publicly until the board approves your profile. You can unpublish or delete your profile at any time.`
- Buttons: `Save draft` · `Submit for approval` · `Delete my profile`. Status line: `Draft` / `Waiting for board approval` / `Published` / `Changes requested: {note}`.
- `/members/admin` — H1 `Board admin` — tabs: `Roster` (intro: `People on this list are confirmed members. Approving a profile adds its owner automatically.` Add/remove umich emails, paste a list), `Review` (each submitter's email, a `New` badge for people not yet on the roster, approve / request changes / `Delete` with the confirm `Delete this profile? This cannot be undone.` then `Profile deleted.`; below it a `Published` list with `Unpublish` and a required note), `Board titles` (every submitted or approved profile, name and email; assign title and display order), `Export` (CSV).

## Privacy (`/privacy`)

- Title: `Privacy | Michigan Sustainable Investments`
- H1: `Privacy`
- Plain statements: what is collected (name, umich email, class year, school, major, LinkedIn URL, headshot, bio, placements); why (to publish the Board and Placements pages and manage the roster); who sees it (the member and board administrators; the public only sees fields the member chose to publish, after board approval); where it is stored (the club's hosted database); sign-in (Google, limited to basic profile and email); deletion (members can delete their profile at any time from the profile page, which removes it from the next site update); contact (`{contactEmail}`).
