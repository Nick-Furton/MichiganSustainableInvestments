// Firms where MSI alumni have worked, shown on the Placements page as a logo wall. No names are published.
// Source: the club's board, from its own alumni records (November 2026). Add or remove a firm only on the
// board's say-so. `logo` is a file in public/firms/; a firm without one is set in type.
export type Firm = { name: string; logo?: string };
export type FirmGroup = { title: string; firms: Firm[] };

export const firmGroups: FirmGroup[] = [
  {
    title: 'Investment banks',
    firms: [
      { name: 'Moelis & Company', logo: 'moelis.svg' },
      { name: 'Morgan Stanley', logo: 'morgan-stanley.svg' },
      { name: 'Bank of America', logo: 'bank-of-america.svg' },
      { name: 'UBS', logo: 'ubs.png' },
      { name: 'Jefferies', logo: 'jefferies.svg' },
      { name: 'Guggenheim Partners', logo: 'guggenheim.svg' },
      { name: 'William Blair', logo: 'william-blair.svg' },
      { name: 'Lincoln International', logo: 'lincoln-international.svg' },
      { name: 'Mizuho', logo: 'mizuho.svg' },
      { name: 'Santander', logo: 'santander.svg' },
      { name: 'KeyBanc Capital Markets', logo: 'keybanc.svg' },
      { name: 'Marathon Capital', logo: 'marathon-capital.svg' },
    ],
  },
  {
    title: 'Private equity and credit',
    firms: [
      { name: 'KKR', logo: 'kkr.svg' },
      { name: 'Blackstone', logo: 'blackstone.svg' },
      { name: 'Apollo Global Management', logo: 'apollo.svg' },
      { name: 'TA Associates', logo: 'ta-associates.svg' },
      { name: 'Wynnchurch Capital', logo: 'wynnchurch.png' },
      { name: 'Bregal Sagemount', logo: 'bregal-sagemount.svg' },
      { name: 'Silver Point Capital', logo: 'silver-point.png' },
    ],
  },
  {
    title: 'Asset management',
    firms: [
      { name: 'BlackRock', logo: 'blackrock.svg' },
      { name: 'Capital Group', logo: 'capital-group.svg' },
      { name: 'Morningstar', logo: 'morningstar.svg' },
      { name: 'Power Sustainable', logo: 'power-sustainable.png' },
      { name: 'Corbin Capital Partners', logo: 'corbin.png' },
    ],
  },
];
