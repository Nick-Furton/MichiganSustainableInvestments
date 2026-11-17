// ONE helper for every internal link and asset, so the site works at "/" and at "/msi-site/".
// Pass paths without a leading slash and with a trailing slash for pages: url('about/'), url('program/#careers'), url('og.png').
const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

export function url(path = ''): string {
  return base + path.replace(/^\/+/, '');
}

// Full address (for canonical links, Open Graph and structured data).
export function abs(path = ''): string {
  const site = (import.meta.env.SITE || 'https://michigansustainableinvestments.com').replace(/\/+$/, '');
  return site + url(path);
}
