# Michigan Sustainable Investments website

A fast, static website for the club, plus a members area where students write their own profiles and the board approves them. The public Board and Placements pages are rebuilt automatically from approved profiles.

## Change club facts
Open `src/data/club.ts`. Every fact (founding year, dues, speaker firms, contact email, social links, application dates) lives there, with a short comment on each line. Save, and every page updates. An empty value hides the related part of the page.

To open applications, set `state` to `'open'`, fill `closes` (as `YYYY-MM-DD`) and `applyUrl`. For a future cycle use `'scheduled'` and `opens`.

## Swap the two placeholder photos
Replace these files with your own photos, keeping the same names:
- `src/assets/placeholder/presenting-hero.jpg` (tall, about 2:3, home page)
- `src/assets/placeholder/presenting-wide.jpg` (wide, about 3:2, Program page)

Then update the description (alt text) in `src/pages/index.astro` and `src/pages/program.astro` to say what the photo shows.

## Preview on your computer
1. Install Node 22 or newer.
2. `npm install`
3. `npm run dev` and open the address it prints.

To see the Board, Placements and members pages with obviously fake people: `SAMPLE_DATA=1 npm run dev`, then add `?demo=1` to a members page address, such as `/members/profile/?demo=1`. A yellow banner marks preview data. Never publish a build made this way.

Settings that change between environments are listed in `.env.example`.

## Run the tests
- `npm test` builds the site three ways (normal, GitHub Pages sub-folder, sample data) and checks every page, then opens it in a browser to check phone and desktop layout.
- `npm run test:db` checks the database rules on a temporary local PostgreSQL. Needs PostgreSQL installed.
- `npm run build` makes the real site in `dist/`.

Going live: see `docs/SETUP.md`. Before launch: `docs/PRELAUNCH.md`.

## Soft launch

The site starts hidden from search engines so the board can check it on a real address first. To make it findable, set `searchVisible: true` in `src/data/club.ts`.
