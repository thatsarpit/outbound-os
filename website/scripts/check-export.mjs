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
let structuredBlocks = 0;
let internalLinks = 0;
const redirected = new Set(['/demo', '/demo/']);
function resolves(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  return redirected.has(decoded) || [decoded, `${decoded}.html`, path.join(decoded, 'index.html')].some((candidate) => {
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
  assert.match(html, /<meta name="description" content="[^"]+"/, `${route}: missing description`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.equal(canonical, `https://outboundos.space${route === '/' ? '' : route}`, `${route}: incorrect canonical`);
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
  assert(!/aisensy|indiamart/i.test(html), `${route}: retired provider remains in rendered content`);
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.equal((sitemap.match(/<loc>/g) || []).length, pages.length, 'Sitemap and page registry differ');
assert.equal(files.filter((file) => /\/og\/.*\.png$/.test(file)).length, pages.length, 'Share-card count differs');
assert(!/aisensy|indiamart/i.test(sitemap), 'Retired routes remain in sitemap');
console.log(JSON.stringify({ pages: pages.length, uniqueTitles: titles.size, structuredBlocks, internalLinks, sitemapAndCards: 'matched' }));
