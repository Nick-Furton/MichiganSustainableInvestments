// The single source of club facts. Every page reads from this file.
// An empty value ('' or an empty list) hides the related piece of the page instead of printing a blank.

export type ApplicationState = 'unannounced' | 'scheduled' | 'open';

export const club = {
  // SOFT-LAUNCH SWITCH. false = every page asks search engines not to list the site yet (use while the
  // board is still confirming the wording). Change to true to make the site findable in search.
  searchVisible: false,
  // Full club name, as written in titles and the footer.
  name: 'Michigan Sustainable Investments',
  // Short form. Used only after the full name has appeared on a page.
  shortName: 'MSI',
  // One-line description shown in the footer-style summaries and llms.txt.
  descriptor: 'The sustainable investing club at the University of Michigan.',
  // The university's name. Never add a logo; the club is not an official unit.
  university: 'University of Michigan',
  // Year the club was founded.
  founded: 2019,
  // Name the club was founded under (used in the footer, Program and Join pages).
  formerName: 'Michigan Impact Investing Symposium',
  // Year the club took its current name.
  renamedYear: 2024,
  // Dues, written as it should read on the page. Empty hides the dues row and the dues question.
  dues: '$25 per semester',
  // Symposium count and the first and last year it was held.
  symposium: { count: 5, firstYear: 2019, lastYear: 2024 },
  // Firms that have sent symposium speakers (plain text, no logos). Empty list hides the speaker section.
  speakerFirms: ['Goldman Sachs', 'Pfizer', 'Orrick', 'Impact Engine', 'Total Impact Capital'],
  // Public contact address of the VP of External. Empty shows "Contact details will be posted here."
  contactEmail: '',
  // Social links. Each one appears in the footer only when it has a value (use the full https:// address).
  social: { linkedin: '', instagram: '', x: '' },
  // How selective the last application round was. Fill in ALL THREE to show the sentence
  // "In {term}, {applied} students applied and {admitted} were admitted." on the Join page and the home page.
  // Leave term empty (or either number 0) to show nothing. Example term: 'Fall 2026'.
  selectivity: { term: '', applied: 0, admitted: 0 },
  // Application cycle. state: 'unannounced' | 'scheduled' | 'open'.
  // opens / closes: dates written YYYY-MM-DD. applyUrl: the application form address (needed for the Apply now button).
  application: {
    state: 'unannounced' as ApplicationState,
    opens: '',
    closes: '',
    applyUrl: '',
  },
};

// The selectivity sentence, or '' while any of the three values is missing.
export function selectivitySentence() {
  const { term, applied, admitted } = club.selectivity;
  if (!term || !(applied > 0) || !(admitted > 0)) return '';
  return `In ${term}, ${applied} students applied and ${admitted} were admitted.`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// 5 -> "five"; larger numbers stay as digits.
export const numberWord = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// ['a','b','c'] -> "a, b and c"
export function listAnd(items: string[]) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
// "2026-03-03" -> "March 3, 2026". Returns '' for an empty or invalid date.
export function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(+d)) return '';
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}
