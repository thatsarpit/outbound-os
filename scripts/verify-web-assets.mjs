#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A missing static asset can return the SPA HTML with status 200. Check bytes
// and dimensions, so a successful HTTP response alone cannot hide a bad icon.
const target = process.argv[2] || 'web/dist';
const remote = /^https?:\/\//.test(target);
async function read(path, contentType) {
  if (!remote) return readFile(resolve(target, path));
  const response = await fetch(new URL(path, `${target.replace(/\/$/, '')}/`));
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert.ok(response.headers.get('content-type')?.includes(contentType), `${path}: content type`);
  return Buffer.from(await response.arrayBuffer());
}
const html = (await read('index.html', 'text/html')).toString();
assert.match(html, /rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png\?v=2"/);
assert.match(html, /rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
const manifest = JSON.parse((await read('manifest.webmanifest', 'application/')).toString());
assert.equal(manifest.name, 'Outbound OS');
assert.equal(manifest.start_url, '/m/inbox');
assert.equal(manifest.display, 'standalone');
for (const [path, size] of [['apple-touch-icon.png', 180], ['app-icon-192.png', 192], ['app-icon-512.png', 512]]) {
  const png = await read(path, 'image/png');
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${path}: PNG bytes`);
  assert.equal(png.readUInt32BE(16), size, `${path}: width`);
  assert.equal(png.readUInt32BE(20), size, `${path}: height`);
  if (size !== 180) assert.ok(manifest.icons.some((icon) => icon.src === `/${path}` && icon.sizes === `${size}x${size}`));
}
const worker = (await read('push-sw.js', 'javascript')).toString();
assert.ok(!worker.trimStart().startsWith('<'), 'Push worker must not be the SPA fallback');
assert.match(worker, /addEventListener\('push'/);
assert.match(worker, /showNotification/);
console.log('Web manifest, Apple icon and 192/512px app icons verified.');
