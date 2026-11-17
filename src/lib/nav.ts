import { loadMembers } from './members';

export type NavItem = { label: string; path: string };

// Team and Placements appear only when at least one approved entry exists.
export async function getNav(): Promise<NavItem[]> {
  const m = await loadMembers();
  const items: NavItem[] = [
    { label: 'Home', path: '' },
    { label: 'About', path: 'about/' },
    { label: 'Program', path: 'program/' },
  ];
  if (m.profiles.length) items.push({ label: 'Team', path: 'team/' });
  if (m.placements.length) items.push({ label: 'Placements', path: 'placements/' });
  items.push({ label: 'Join', path: 'join/' }, { label: 'For employers', path: 'employers/' });
  return items;
}
