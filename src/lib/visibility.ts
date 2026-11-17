import { club } from '../data/club';

// Whether pages may be listed by search engines. The switch is `searchVisible` in src/data/club.ts.
// Tests set SEARCH_VISIBLE=1 or 0 to exercise both states without editing that file.
export const searchVisible = () =>
  process.env.SEARCH_VISIBLE ? process.env.SEARCH_VISIBLE === '1' : club.searchVisible;
