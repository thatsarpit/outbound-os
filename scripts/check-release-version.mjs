import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readBuildInfo } from '../shared/buildInfo.js';

const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const repository = fileURLToPath(new URL('../', import.meta.url));

function requireNewestReleaseTag(tag) {
  const tags = execFileSync('git', ['tag', '--sort=-version:refname', '--list'], {
    cwd: repository, encoding: 'utf8',
  }).trim().split('\n');
  const newest = tags.find(candidate => stableTag.test(candidate));
  if (tag !== newest) throw new Error(`Release ${tag} is older than ${newest}. Bump VERSION and use a fresh tag.`);
}

export function checkReleaseVersion(tag) {
  const build = readBuildInfo();
  tag ??= `v${build.version}`;
  if (!stableTag.test(tag) || tag !== `v${build.version}` || build.channel !== 'release') {
    throw new Error('Use a clean checkout of a release tag matching VERSION.');
  }
  requireNewestReleaseTag(tag);
  return build;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const build = checkReleaseVersion(process.argv[2]);
  console.log(`Verified release v${build.version} at ${build.revision}.`);
}
