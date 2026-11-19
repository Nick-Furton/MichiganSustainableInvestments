export type NavItem = { label: string; path: string };

// Four sections, always shown, in this order.
export async function getNav(): Promise<NavItem[]> {
  return [
    { label: 'Who We Are', path: 'who-we-are/' },
    { label: 'Placements', path: 'placements/' },
    { label: 'Leadership', path: 'leadership/' },
    { label: 'Recruitment', path: 'recruitment/' },
  ];
}
