import { Code } from '@/components/content'
import { DocsShell, docMetadata } from '@/components/docs-shell'
import { site } from '@/lib/site-content'

export const metadata = docMetadata('backups-and-upgrades')

export default function BackupsDoc() {
  return (
    <DocsShell slug="backups-and-upgrades">
      <p>
        Everything Outbound OS stores is in one Docker volume,{' '}
        <code>outboundos-data</code>: the SQLite database and{' '}
        <code>instance-secrets.json</code>. Back up both, keep a copy off the
        server, and an upgrade or a move to a new machine is routine.
      </p>

      <div className="note note--warn">
        Keep the database and <code>instance-secrets.json</code> together.
        Saved WhatsApp, email and iMessage credentials are encrypted with a key
        in that file; a database restored without it loses every saved
        credential.
      </div>

      <h2 id="backup">Back up</h2>
      <p>
        The included script takes a consistent copy while the app is running,
        checks its integrity, compresses it and keeps the newest seven:
      </p>
      <Code label="Terminal">
        {`docker compose exec app bash scripts/backup.sh
docker compose cp app:/app/data/backups ./backups
docker compose cp app:/app/data/instance-secrets.json ./backups/`}
      </Code>
      <p>
        Then copy <code>./backups</code> somewhere that is not this server —
        object storage, another machine, an encrypted drive. Treat it as
        sensitive: it holds your contacts and the key to your credentials.
      </p>

      <h3 id="schedule">Every night</h3>
      <p>Add a cron entry on the host, adjusting the path:</p>
      <Code label="crontab -e">
        {'0 2 * * * cd /opt/outbound-os && docker compose exec -T app bash scripts/backup.sh'}
      </Code>

      <h2 id="restore">Restore, or move to a new server</h2>
      <ol>
        <li>
          On the new server, install as usual with the same <code>.env</code>{' '}
          and start it once so the volume exists.
        </li>
        <li>
          Put the backup and <code>instance-secrets.json</code> in a{' '}
          <code>backups</code> folder next to <code>docker-compose.yml</code>.
        </li>
        <li>Stop the app, copy both files into the volume, and start again:</li>
      </ol>
      <Code label="Terminal">
        {`docker compose stop app
docker compose run --rm --no-deps -v "$PWD/backups:/restore:ro" app sh -c \\
  'gunzip -c /restore/outbound-os_20260928_020000.db.gz > /app/data/outboundos.db \\
   && cp /restore/instance-secrets.json /app/data/instance-secrets.json'
docker compose up -d`}
      </Code>
      <p>
        Use your own backup&rsquo;s file name. The one-off container runs as
        the same user as the app, so file ownership is right, and any
        migrations the backup is missing run on start.
      </p>

      <h2 id="upgrade">Upgrade</h2>
      <ol>
        <li>
          Read the{' '}
          <a href={`${site.githubUrl}/blob/main/CHANGELOG.md`}>changelog</a>{' '}
          for anything that needs a new setting.
        </li>
        <li>Take a backup.</li>
        <li>Pull and rebuild:</li>
      </ol>
      <Code label="Terminal">{'git pull\ndocker compose up -d --build'}</Code>
      <p>
        Database migrations run automatically before the app starts. If you
        run the MCP server, add <code>--profile mcp</code> to the second
        command so it is rebuilt too.
      </p>

      <h2 id="rollback">Roll back</h2>
      <p>
        Check out the previous release tag, rebuild, and restore the backup
        you took before upgrading. Migrations only move forward, so a database
        that has already been migrated should not be run with older code.
      </p>
      <Code label="Terminal">{'git checkout v0.1.0\ndocker compose up -d --build'}</Code>
    </DocsShell>
  )
}
