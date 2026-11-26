import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const version = readFileSync(new URL('VERSION', root), 'utf8').trim();
const stamp = new URL('.outboundos-build', root);
const validRevision = /^[0-9a-f]{40}$/;

export function readBuildInfo() {
  if (existsSync(stamp)) {
    const [revision, tag] = readFileSync(stamp, 'utf8').trimEnd().split('\n');
    if ((revision && !validRevision.test(revision)) || (tag && (tag !== `v${version}` || !revision))) {
      throw new Error('Invalid Outbound OS build stamp. Use the full source revision and a release tag matching VERSION.');
    }
    if (revision) return { version, revision, channel: tag ? 'release' : 'development' };
  }

  // Source checkouts can identify themselves even when no release was built.
  if (existsSync(new URL('.git', root))) {
    const git = (...args) => execFileSync('git', args, {
      cwd: fileURLToPath(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
    try {
      const revision = git('rev-parse', 'HEAD');
      if (validRevision.test(revision)) {
        if (git('status', '--porcelain', '--untracked-files=normal')) {
          return { version, revision, channel: 'local' };
        }
        const tagged = git('tag', '--points-at', revision, '--list', `v${version}`);
        return { version, revision, channel: tagged ? 'release' : 'development' };
      }
    } catch {
      // Git may be missing on manual installs or the checkout may be shallow.
    }
  }
  return { version, revision: null, channel: 'local' };
}
