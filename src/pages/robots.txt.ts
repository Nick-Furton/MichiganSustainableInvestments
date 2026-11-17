import { abs } from '../lib/url';

// Generated so the sitemap address always matches the site's real URL (free test address or own domain).
// Crawling stays allowed even during the soft launch: crawlers must be able to read the "noindex" tag.
export function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap-index.xml')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
