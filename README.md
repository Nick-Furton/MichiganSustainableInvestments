# Michigan Sustainable Investments website

A fast, static website for the club, plus a members area where students write their own profiles and the board approves them. The public Leadership and Placements pages are rebuilt automatically from approved profiles.

## Change club facts
Open `src/data/club.ts`. Every fact (founding year, dues, speaker firms, contact email, social links, application dates) lives there, with a short comment on each line. Save, and every page updates. An empty value hides the related part of the page.

To open applications, set `state` to `'open'`, fill `closes` (as `YYYY-MM-DD`) and `applyUrl`. For a future cycle use `'scheduled'` and `opens`.

## Swap the two placeholder photos
Replace these files with your own photos, keeping the same names:
- `src/assets/placeholder/presenting-hero.jpg` (tall, about 2:3, the photo on the home page)
- `src/assets/placeholder/presenting-wide.jpg` (wide, about 3:2, Program page)

Then update the description (alt text) in `src/pages/index.astro` and `src/pages/who-we-are.astro` to say what the photo shows.

## How the site is laid out
- **Home page** (`src/pages/index.astro`): a one-screen landing page with the photo, the club name, two buttons and links to the four sections. It has no site header or footer, and it is sized to fit the window without scrolling. Its styles are the `.landing` block in `src/styles/global.css`. The home photo is `src/assets/placeholder/presenting-hero.jpg`.
- **Placements page**: a wall of firm logos. The firms and groups are in `src/data/firms.ts`. The logo files are in `public/firms/`, and `public/firms/SOURCES.txt` says where each one came from. To add a firm, add its logo file and a line in `src/data/firms.ts`.
- **Contact form**: `supabase/03_contact.sql` (the database side), `src/pages/[contact].astro` (the page), `src/scripts/contact.ts` and `src/scripts/contact-send.ts` (the form). The page exists only after the SQL file has been run: each build asks the database (`scripts/prebuild.mjs`) and `src/lib/contact.ts` holds the answer. The board reads messages on the admin page, under Messages.
- **Page wording**: `docs/CONTENT.md` has the exact copy of every page.

## Preview on your computer
1. Install Node 22 or newer.
2. `npm install`
3. `npm run dev` and open the address it prints.

To see the Leadership, Placements and members pages with obviously fake people: `SAMPLE_DATA=1 npm run dev`, then add `?demo=1` to a members page address, such as `/members/profile/?demo=1`. A yellow banner marks preview data. Never publish a build made this way.

Settings that change between environments are listed in `.env.example`.

## Run the tests
- `npm test` builds the site several ways (normal, GitHub Pages sub-folder, sample data, soft launch, and against a pretend database with the contact form on and off) and checks every page. It then opens the site in a browser to check the layout, that the home page fits one screen at many window sizes, accessibility, and the contact form.
- `npm run test:db` checks the database rules (members area and contact form) on a temporary local PostgreSQL. Needs PostgreSQL installed.
- `npm run preview:shots` saves screenshots of the main pages to `_preview/`.
- `npm run build` makes the real site in `dist/`.

Going live: see `docs/SETUP.md`. Before launch: `docs/PRELAUNCH.md`.

## Soft launch

The site starts hidden from search engines so the board can check it on a real address first. To make it findable, set `searchVisible: true` in `src/data/club.ts`.
