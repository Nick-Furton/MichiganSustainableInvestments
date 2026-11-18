import { loadMembers } from './members';

export type NavItem = { label: string; path: string };

// Board is always in the nav. Placements appears only when at least one approved entry exists.
export async function getNav(): Promise<NavItem[]> {
  const m = await loadMembers();
  const items: NavItem[] = [
    { label: 'Home', path: '' },
    { label: 'Sustainable investing', path: 'sustainable-investing/' },
    { label: 'Program', path: 'program/' },
    { label: 'Board', path: 'board/' },
  ];
  if (m.placements.length) items.push({ label: 'Placements', path: 'placements/' });
  items.push({ label: 'Join', path: 'join/' }, { label: 'For employers', path: 'employers/' });
  return items;
}
