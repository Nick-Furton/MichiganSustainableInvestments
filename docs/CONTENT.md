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
- Header (every page except the home page): the logo (links home), the four section links `Who We Are` · `Placements` · `Leadership` · `Recruitment`, a quiet text link `Member sign-in` (→ /members/), and at most one dark button. The button is `Apply` (→ /recruitment/) while applications are open or scheduled (`applyOffered()` in `src/data/club.ts`); otherwise `Contact` (→ /contact/) when the contact form is switched on; otherwise there is no button. No breadcrumb trail is shown on any page (the BreadcrumbList structured data stays in the page source).
- Footer notice (every page except the home page): `Michigan Sustainable Investments is a student organization at the University of Michigan and is not an official unit of the University. Nothing on this site is investment advice.` This one sentence carries the trademark wording for the whole site.
- Footer history line: `Founded in 2019 as the Michigan Impact Investing Symposium. Renamed Michigan Sustainable Investments in 2024.` **The club's history lives here, and in the Organization data for search engines. Pages do not repeat it.**
- Footer links (every page except the home page), in this order: `Who We Are`, `Placements`, `Leadership`, `Recruitment`, `Contact` (only when the contact form is switched on), `Member sign-in`, `Privacy`.
- **Say each fact once.** A fact (the speaker firms, the list of instruments, the club's history, the trademark wording, a sign-in sentence) is written in one place and not repeated on the same page or across pages. The test suite checks the main ones. Wording removed on purpose (for example `Who has spoken at MSI`, `Common questions`, `Contact details will be posted here`, `does not speak for it`) is checked to stay out.
- Placeholder photo: only the home page has one (`src/assets/placeholder/presenting-hero.jpg`). Alt text: `A presenter in a dark suit points to a slide while an audience looks on.` (No caption. Never describe the people as MSI members.)


## Look

- Headings and people's names are set in a serif (Source Serif 4). Everything else is Inter. Both typefaces are part of the site's own files; nothing is loaded from another company's servers.
- Corners are nearly square (buttons, cards, form fields). No hand-drawn underlines, no decorative dashes, no boxes around logos.
- Yellow (maize) is an accent only: the leaf in the logo, the bar on the application status box, the line under a menu item on hover.
- Pages are kept tight: sections sit close together and the page is at most 1200px wide, so there are no large empty areas. Do not add a disclaimer under the logo wall; the footer notice is the only one.

## Home (`/`)

The home page is a one-screen landing page. It has no site header and no site footer, and it is built to fit the window without scrolling.

- Title: `Michigan Sustainable Investments | University of Michigan`
- Description: `Michigan Sustainable Investments (MSI) is the student-run sustainable investing club at the University of Michigan. Founded in 2019. Membership by application.`
- Photo: placeholder `presenting-hero.jpg` (`src/assets/placeholder/presenting-hero.jpg`), on the left on a wide screen. On a narrow screen it becomes a band across the top with the name on it. Alt text is the placeholder alt text under Global.
- H1: `Michigan Sustainable Investments`, plain text (no underline or highlight), with the club mark and the line `at the University of Michigan`.
- Lead: `Welcome to MSI, Michigan's sustainable investing club. Members prepare for careers in investment banking, private equity and asset management.`
- Buttons, only for visitors: `Apply` (→ /recruitment/) while applications are open or scheduled; `Contact us` (→ /contact/) when the contact form is switched on. `Contact us` is dark when it is the only button and outline when `Apply` is also shown. With neither, there is no button row at all.
- Section links, in this order: `Who We Are` · `Placements` · `Leadership` · `Recruitment`.
- Small print: `MSI is a student organization at the University of Michigan and is not an official unit of the University. Nothing on this site is investment advice.` Then always `Member sign-in` · `Privacy` (a link to /members/ and a link to /privacy/).
- No member counts, no school names, no section blocks. Everything else lives on the section pages.

**The fit-on-one-screen rule.** The page must not scroll, up or sideways, at these window sizes (width x height). The test suite checks every one in a real browser, on the normal build and on a build with the contact form on:

2560x1440 · 1920x1080 · 1728x1117 · 1536x864 · 1440x900 · 1366x768 · 1366x650 · 1280x720 · 1280x600 · 1180x820 · 1024x768 · 1024x600 · 900x700 · 861x640 · 860x1000 · 820x1180 · 768x1024 · 430x746 · 414x720 · 412x780 · 393x660 · 390x664 · 375x667 · 360x640

At 320x568 and 844x390 the page may scroll, but nothing may be cut off and the Privacy link must be reachable. If you change the home page text or sizes, run `npm test`: it tells you which window size broke. The styles are the `.landing` block in `src/styles/global.css`. The list of sizes is `FIT_SIZES` in `scripts/test-site.mjs`.

## Who We Are (`/who-we-are/`)

Absorbs the old Program page.

- Title: `Who We Are | Michigan Sustainable Investments`
- Description: `Michigan Sustainable Investments (MSI) is the student-run sustainable investing club at the University of Michigan. What the club does and how its program works.`
- H1: `Who we are`
- Lead: `Michigan Sustainable Investments (MSI) is the sustainable investing club at the University of Michigan. It was founded in 2019 and is run entirely by students.`
- H2 `What we do` — `MSI teaches undergraduates how capital is allocated when return and impact both count. Members study public equities, green bonds, venture capital, microfinance and clean-energy finance. They hear directly from people who invest for a living.`
- H2 `The program`, then four H3 blocks:
  - `Investing education` — `Modules cover how investors evaluate a deal for financial return and for impact.` (One sentence. The list of instruments is stated once, under `What we do`.)
  - `Hands-on projects` — `Members apply the material in team projects and present their work to the club.` [CONFIRM]
  - `Professional development` — `Sessions cover finance recruiting: building a résumé, networking and interviewing.` [CONFIRM]
  - `Speakers and the Symposium` — `MSI hosts investors and operators on campus. Its symposium ran five times between 2019 and 2024, with speakers from Goldman Sachs, Pfizer, Orrick, Impact Engine and Total Impact Capital.` The speaker firms appear here and nowhere else on the page. Naming a firm is not an endorsement claim; the footer carries the one trademark sentence.
- No photo, no `Who has spoken at MSI` section and no `Sustainable finance is a way into banking` block.


## Placements (`/placements/`)

- Always in the nav and footer, always indexable and in the sitemap.
- Title: `Placements | Michigan Sustainable Investments`
- Description: `Firms where alumni of Michigan Sustainable Investments (MSI) have worked, in investment banking, private equity and asset management.`
- H1: `Placements`
- Intro line: `MSI alumni have gone on to work at these firms.`
- Logo wall: three groups, each with an H2 (a thin rule under it), in this order: `Investment banks` · `Private equity and credit` · `Asset management`. Each firm is one logo in a column list, 24 in all, with no border or box. The logo's alt text is the firm's name. No member names appear in the wall.
- **Where to edit the list:** `src/data/firms.ts` lists the groups, the firms and each firm's logo file. Logo files are in `public/firms/`; `public/firms/SOURCES.txt` records where each one came from. To add a firm, add its logo file, then add a line to `src/data/firms.ts`. A firm with no logo file is shown as its name in type. Add or remove a firm only on the board's say-so. The page reads each logo's size when the site is built.
- H2 `Offers by year` (only when members have reported offers that the board approved): H3 year headings, newest first. Each row, plain text: firm · group or team · `Internship` or `Full-time` · member name (only if that member consented to show it) · class year. Footnote: `Updated {Month YYYY}.` When there are no offers, this section is not on the page.
- H2 `Careers members prepare for` — one paragraph, no list, no `#careers` anchor: `Banks, asset managers and funds now staff teams built around the energy transition: renewables and power groups in investment banking, green bond desks, ESG research, and impact and climate funds. MSI members study the instruments those teams use.` [CONFIRM]

## Leadership (`/leadership/`)

- Title: `Leadership | Michigan Sustainable Investments`
- Description: `The executive board of Michigan Sustainable Investments (MSI) at the University of Michigan: the students who run the club, with their roles and class years.`
- H1: `Leadership`
- No lead sentence and no `Executive board` heading. Approved profiles that have a board title come first, one card per person, with the person's name as an H2 (so the headings run H1 then H2, with no skipped level). Cards: headshot, name, **the person's own board title**, class year, major, LinkedIn link. Every card carries its own title, so two co-presidents each show `Co-President`. **Do not replace the titles on the cards with a shared label above a group** (tried in November 2026; the club prefers a title on each card). People who share a title are kept next to each other, wherever each was placed in the order; the pair sits where its first holder sits. Titles that differ only in capitals or spacing count as the same. Then H2 `Members`: approved profiles without a title, only when there are any. Board titles and order are set by an administrator, never by the member. `llms.txt` lists the board one line per title (`- Title: Name, Name`).
- Empty state (no approved profiles): `Board profiles are being added. Members can sign in to add theirs.` + link `Member sign-in →`. While empty the page is `noindex` and out of the sitemap.

## Recruitment (`/recruitment/`)

- Title: `Recruitment | Michigan Sustainable Investments`
- Description: `How to join Michigan Sustainable Investments (MSI) at the University of Michigan. Membership is by application.`
- H1: `Recruitment`
- Lead: `Membership is by application.`
- Under the lead, when `selectivity` is set in `club.ts`: `In {term}, {applied} students applied and {admitted} were admitted.` (hidden otherwise)
- Status block, driven by `club.ts`:
  - open: `Applications are open until {closes}.` + button `Apply now` → application link
  - scheduled: `Applications open {opens}.`
  - default (closed): `Applications are closed. Dates for the next cycle have not been announced.`
- H2 `Dues` (only when `dues` is set in `club.ts`): `{dues}.` For example `$25 per semester.` [CONFIRM]
- There is no questions list. The facts it held live in one place each (see Global).

## Contact (`/contact/`)

The Contact page exists only when the contact form is switched on. The site checks this each time it is built: it asks the database whether `supabase/03_contact.sql` has been run. Until then there is no Contact page, no link to it, and the home page shows `Member sign-in` as its second button (see Home).

- Title: `Contact | Michigan Sustainable Investments`
- Description: `Contact Michigan Sustainable Investments (MSI), the sustainable investing club at the University of Michigan.`
- H1: `Contact`
- Lead: `Send the MSI board a message.`
- Fields, in this order:
  - `Name` — required, up to 120 characters.
  - `Email` — required.
  - `Firm, school or organization` — optional, up to 160 characters.
  - `What is this about?` — required. Choices: `Recruiting or meeting members` · `Speaking at MSI` · `Joining MSI` · `Something else`. None is chosen to start with.
  - `Message` — required, 10 to 4,000 characters. Hint: `10 to 4,000 characters.`
  - A hidden field that people never see, labelled `Leave this field empty`. Robots fill it in; a message that fills it is thrown away silently.
- Button: `Send message`. Under it: `Your message goes to the MSI board. See Privacy.` (`Privacy` links to /privacy/.)
- While sending, the button reads `Sending…` and cannot be pressed again.
- On success the form is replaced by: `Your message has been sent to the MSI board.` and a link `Back to the home page`.
- Field messages: `Enter your name.` · `Enter a valid email address.` · `Choose what this is about.` · `Write at least 10 characters.` · `Keep the message to 4,000 characters or fewer.` · `Keep this to 160 characters or fewer.`
- Limits, answered by the database: `You have sent three messages today. Try again tomorrow.` (one sender, three a day) · `The form is busy. Try again in an hour.` (twenty an hour for everyone, or 500 unhandled messages waiting).
- Any other failure: `Your message was not sent. Check your connection and try again.` Whatever the person typed stays in the form.
- Without JavaScript: a notice says the form needs JavaScript to send.
- The board reads messages on the admin page, under `Messages` (see Members area). There is no email alert when a message arrives.

## Members area (not indexed: `noindex`)

- `/members` — H1 `Member sign-in` — no lead sentence under the heading — the sentence `Sign in with your University of Michigan Google account to create or update your profile.` appears once, in the sign-in panel — button `Sign in with Google` — note: `Use your @umich.edu Google account. New members can create a profile right away. The board approves every profile before it appears on the site.`
- States: not configured → `Member sign-in is not switched on yet.` · wrong domain → `Use your @umich.edu account.` · applicant (signed in, not on the roster yet) → the profile form with the line `Fill in your profile and submit it. The board reviews it before anything appears on the site.` There is no "not on the roster" state: anyone with an @umich.edu Google account can create a profile, and approval by the board makes them a member.
- `/members/profile` — H1 `Your profile` — fields: full name; class year; major; LinkedIn URL; headshot; short bio (max 400 characters); placements (firm, group or team, internship or full-time, year). Board title is shown read-only with the note `Set by the board.`
- Consent heading `Choose what appears on the public site` — checkboxes: `My name, class year and program` · `My headshot` · `My LinkedIn link` · `My placements` · `My name next to my placements`. Note: `Nothing appears publicly until the board approves your profile. You can unpublish or delete your profile at any time.`
- Buttons: `Save draft` · `Submit for approval` · `Delete my profile`. Status line: `Draft` / `Waiting for board approval` / `Published` / `Changes requested: {note}`.
- `/members/admin` — H1 `Board admin` — tabs: `Roster` (intro: `People on this list are confirmed members. Approving a profile adds its owner automatically.` Add/remove umich emails, paste a list), `Review` (each submitter's email, a `New` badge for people not yet on the roster, approve / request changes / `Delete` with the confirm `Delete this profile? This cannot be undone.` then `Profile deleted.`; below it a `Published` list with `Unpublish` and a required note), `Board titles` (every submitted or approved profile, name and email; assign title and display order), `Messages` (contact form messages, newest first; the tab shows how many are waiting, such as `Messages (2)`. Each card has the name, the email as a link, the organization, the topic, the date and time, the message with its line breaks, a `New` or `Handled` tag, `Mark handled` or `Reopen`, and `Delete` (asks first). `Delete all handled` removes every handled message. Empty: `No messages.` If the form is not installed: `The contact form is not switched on. Run supabase/03_contact.sql in Supabase, then republish the site.`), `Export` (CSV).

## Privacy (`/privacy`)

- Title: `Privacy | Michigan Sustainable Investments`
- H1: `Privacy`
- Plain statements: what is collected (name, umich email, class year, major, LinkedIn URL, headshot, bio, placements); why (to publish the Leadership and Placements pages and manage the roster); who sees it (the member and board administrators; the public only sees fields the member chose to publish, after board approval); where it is stored (the club's hosted database); sign-in (Google, limited to basic profile and email); deletion (members can delete their profile at any time from the profile page, which removes it from the next site update); a `Contact` heading and line only when there is a contact address (`{contactEmail}`) or the contact form is on (`Use the contact form.` linking to /contact/); with neither, the heading and line are left out. When the contact form is on, a `Contact form` section is added: `The contact form stores your name, email address, organization (if you give one) and your message. Only the board can read it. The board deletes a message on request.`

## Search and AI facts (not visible on the pages)

- Every page: `og:locale` `en_US`; BreadcrumbList structured data on inner pages (no visible breadcrumbs).
- Home page Organization data: name; `alternateName` as a list (`MSI` and the former name); description; founding date; address (Ann Arbor, MI, US, from `club.location`); `knowsAbout`; `contactPoint` with the Contact page address only when the contact form is on; `email` only when `contactEmail` is set.
- Leadership: Person data with an `image` when a headshot is published.
- `llms.txt`: states the rename year, and has a `Leadership` list (name, title) when board members are published.
- Sitemap: each entry has `lastmod`, the date of the newest git commit (left out when git is not available).
