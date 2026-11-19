# Back up and restore a self-hosted instance

Use the verified instance backup on a release that includes this guide. It
takes a SQLite snapshot while the app is online, includes the stored media and
encrypted email originals referenced by that snapshot, and records checksums
for each file. Both effective instance keys travel with the snapshot. A missing
referenced file fails the backup before it is published. Avoid deleting media
or rotating keys during the backup. Run it with the same configuration that
the running app used at startup.

## Create a backup

```sh
docker compose exec -T app npm run backup:instance
```

The command prints the path of a new `instance-…` directory under
`/app/data/backups`. Copy that directory to a private location on the host,
then move a copy to encrypted storage outside the server. Restrict access to
the files because they contain customer data and the keys to decrypt it.

```sh
docker compose cp app:/app/data/backups/INSTANCE_DIRECTORY ./private-backup
```

Preserve the host Compose configuration, `.env` and any externally managed
configuration in the same protected recovery inventory. The container sees
injected environment values but usually cannot read the host's `.env`.
For a source install, run `npm run backup:instance` with the app's environment.
It copies a readable checkout `.env` to `app.env`. Pass
`-- --env FILE --output DIRECTORY` when the app uses a different configuration
file or when you want a different destination. The two instance keys are
included even when supplied in the environment.

If MCP is enabled, preserve its separate OAuth store after stopping MCP to
prevent changes during the copy. If the file is available on the backup
runner, pass `-- --mcp-store FILE` to include it in the checksummed set.
Otherwise preserve it separately with the Compose configuration and record
its association with the app backup. Schedule and retention are operator
settings for the new backup command. The legacy `npm run backup` retains
its existing SQLite and inbound-originals format and rotation.

## Verify a restore before replacing anything

Use the release that created the backup. With Node.js 24 or newer and installed
dependencies, run from that source checkout:

```sh
npm run restore:instance -- /private/backup/INSTANCE_DIRECTORY /private/staged-restore
```

The destination must be a new directory. The command checks the manifest and
file checksums, checks SQLite integrity, and checks that each media or original
email reference is present. It stages the database, instance keys and files
without starting services or touching an existing installation.

For a rehearsal, mount the staged database, key file and app data into a new
volume using a disposable configuration. Keep the original encryption key
available to verify encrypted content. Block outgoing network access first
because the restored database can still contain encrypted sending credentials.
Open a sample attachment and confirm the business records. Check the restore
before choosing to cut over.

For a real migration, keep the current instance stopped during the cutover.
Use a clean app volume with the restored files and the intended runtime
configuration. Place `outboundos.db` and `instance-secrets.json` together at
the configured database path and `media/` in the application data directory.
Keep `private/inbound-email/` alongside the database. Review `app.env` or the
original host settings before reuse, since paths, URLs and secret overrides
must match the new deployment. Treat the staged OAuth file as private and
restore it only if needed into the separate MCP volume. Keep the previous
image, configuration and recovery set until validation succeeds. If a newer
release migrates the database, reverting the image also requires a compatible
database restore.
