import { club, formatDate } from '../data/club';
import { abs } from '../lib/url';

// Plain-text summary for AI crawlers, generated from src/data/club.ts.
export function GET() {
  const a = club.application;
  const lines = [
    `# ${club.name}`,
    '',
    `> ${club.descriptor} Student-run, founded ${club.founded}. Membership by application.`,
    '',
    `${club.name} (${club.shortName}) is a student organization at the ${club.university}. It is not an official unit of the University. It was founded in ${club.founded} as the ${club.formerName}.`,
    '',
    '## Pages',
    `- [About](${abs('about/')}): history, mission and key facts`,
    `- [Program](${abs('program/')}): what members do`,
    `- [Join](${abs('join/')}): how to apply${a.state === 'open' && a.closes ? `; applications open until ${formatDate(a.closes)}` : ''}`,
    `- [For employers](${abs('employers/')}): speak, meet members or support the symposium`,
    `- [Résumé and LinkedIn guide](${abs('members/resume-guide/')}): how to list the club`,
    '',
    '## Facts',
    `- Founded: ${club.founded}`,
    `- Formerly: ${club.formerName} (${club.formerShortName})`,
    ...(club.dues ? [`- Dues: ${club.dues}`] : []),
    `- Symposia held: ${club.symposium.count} (${club.symposium.firstYear} to ${club.symposium.lastYear})`,
    ...(club.speakerFirms.length ? [`- Symposium speaker affiliations: ${club.speakerFirms.join(', ')}`] : []),
    ...(club.contactEmail ? [`- Contact: ${club.contactEmail}`] : []),
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
