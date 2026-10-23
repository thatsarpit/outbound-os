import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || 'out');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(root);
const pages = files.filter((file) => file.endsWith('.html') && !['404.html', '_not-found.html'].includes(path.basename(file)));
const titles = new Set();
const descriptions = new Set();
const canonicalUrls = new Set();
let structuredBlocks = 0;
let internalLinks = 0;
const redirects = new Map(fs.readFileSync(path.join(root, '_redirects'), 'utf8').split('\n')
  .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const [from, to, status] = line.split(/\s+/); return [from, { to, status }]; }));
function resolves(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  return redirects.has(decoded) || [decoded, `${decoded}.html`, path.join(decoded, 'index.html')].some((candidate) => {
    const absolute = path.join(root, candidate);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  });
}
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const route = relative === 'index.html' ? '/' : `/${relative.replace(/\.html$/, '')}`;
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title && !titles.has(title), `${route}: missing or duplicate title`);
  titles.add(title);
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${route}: expected one primary heading`);
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert(description && !descriptions.has(description), `${route}: missing or duplicate description`);
  descriptions.add(description);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.equal(canonical, `https://outboundos.space${route === '/' ? '' : route}`, `${route}: incorrect canonical`);
  canonicalUrls.add(canonical);
  const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  assert(image && resolves(new URL(image, 'https://outboundos.space').pathname), `${route}: missing share image`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    const json = JSON.parse(match[1]);
    assert.equal(json['@context'], 'https://schema.org');
    structuredBlocks++;
  }
  for (const match of html.matchAll(/href="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    assert(resolves(match[1]), `${route}: broken internal link ${match[1]}`);
    internalLinks++;
  }
  for (const match of html.matchAll(/<img\b([^>]+)>/g)) {
    assert(/\balt="[^"]*"/.test(match[1]), `${route}: image missing alt text`);
    const src = match[1].match(/\bsrc="(\/[^"?#]*)/)?.[1];
    if (src) assert(resolves(src), `${route}: missing image ${src}`);
  }
  assert(!/aisensy|indiamart|engyne/i.test(html), `${route}: retired integration remains in rendered content`);
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.deepEqual(new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])), canonicalUrls, 'Sitemap must match exact canonical pages');
assert.equal(files.filter((file) => /\/og\/.*\.png$/.test(file)).length, pages.length, 'Share-card count differs');
assert(!/aisensy|indiamart|engyne/i.test(sitemap), 'Retired routes remain in sitemap');
for (const route of ['/integrations/aisensy', '/alternatives/aisensy', '/integrations/indiamart', '/integrations/engyne-cloud']) {
  for (const from of [route, `${route}/`]) {
    const redirect = redirects.get(from);
    assert.equal(redirect?.status, '301', `${from}: must preserve old links permanently`);
    assert(!redirects.has(redirect.to) && resolves(redirect.to), `${from}: redirect must resolve without a chain`);
  }
}
console.log(JSON.stringify({ pages: pages.length, uniqueTitles: titles.size, uniqueDescriptions: descriptions.size, structuredBlocks, internalLinks, sitemapAndCards: 'matched', retiredRedirects: 8 }));
