import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function forbiddenArtifact(file) {
  const normalized = file.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  if (/^\.env(?:\..*)?$/.test(basename) && basename !== '.env.example') return 'environment credentials';
  if (/(?:^|\/)(?:node_modules|data|logs|backups|exports|\.wwebjs_auth|\.wwebjs_cache|\.next|dist|dist-demo)(?:\/|$)/.test(normalized)) return 'generated or runtime data';
  if (/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/.test(basename)) return 'database';
  if (/^(?:instance-secrets|oauth-store|.*-private)\.json$/.test(basename) || /\.(?:pem|key|p12|pfx)$/.test(basename)) return 'private credentials';
  if (basename === '.DS_Store' || /\.tsbuildinfo$/.test(basename)) return 'local build/editor artifact';
  return null;
}

export function checkTrackedArtifacts(files) {
  return files.flatMap(file => {
    const reason = forbiddenArtifact(file);
    return reason ? [{ file, reason }] : [];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const failures = checkTrackedArtifacts(files);
  if (failures.length) {
    for (const { file, reason } of failures) console.error(`${file}: ${reason}`);
    console.error('Remove these files from tracking and keep runtime data outside source control.');
    process.exitCode = 1;
  } else console.log(`Repository hygiene passed: ${files.length} tracked files checked.`);
}
