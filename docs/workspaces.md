# Multiple workspaces on one server

Use one Outbound OS dashboard and one Clerk account to open the businesses you
belong to. The primary workspace keeps its existing URLs and database.
Secondary workspaces use addresses such as `/w/voyd/leads`. Each workspace has
its own contacts, inbox, files, campaigns, settings, team and sender records.
The workspace name and switcher are in the desktop and phone headers.

## Pilot setup

Workspace mode is opt-in for Clerk installations. Keep the existing primary
workspace and Clerk organization. The same Clerk instance provides sign-in and
organization membership for all workspaces on this dashboard. Use the same
Clerk user for memberships that belong to the same person. Organization roles
apply within each workspace. A Clerk organization that has no configured
workspace cannot open CRM data.

1. In the existing Clerk instance, create a separate organization for the
   second business and add yourself to it. Invite other people through Team
   only after confirming that the workspace opens with the intended header.
2. Use the same application image digest for the main service and its private
   workspace services. The [Compose example](../setup/compose.workspaces.yml)
   adds a private service and named data volume to the existing Compose project.
   Keep the original service name, project name and mounts. A custom hosting
   stack must attach both services to the same private network. Publish only
   the main API through the proxy.
3. Create `.env.workspace-voyd` beside the primary Compose file. Use the same
   Clerk publishable and secret keys, the second organization's ID, and the
   dashboard origin in `CORS_ORIGIN`. Set `PUBLIC_URL` to the dashboard's public
   HTTPS origin for lead-source instructions. Give the child a fresh volume and
   keep sender credentials, provider keys and MCP tokens out of its environment
   until those integrations are configured specifically for it. The image
   generates workspace encryption keys in its own volume. Set env-file
   permissions to owner only.
4. Set these values on the **primary** API. Substitute the actual Clerk ID
   and use the private Compose service name for the origin.

   ```dotenv
   OUTBOUNDOS_PRIMARY_WORKSPACE_NAME="Pharma Sales"
   OUTBOUNDOS_WORKSPACES='[{"id":"voyd","name":"Voyd Media","organizationId":"org_EXAMPLE","origin":"http://workspace-voyd:3001"}]'
   ```

5. Start both services with a single Compose project. For the repository's
   default Compose layout, that is
   `docker compose -f docker-compose.yml -f setup/compose.workspaces.yml up -d`.
   Serve the matching dashboard build at the existing origin. The same-origin
   frontend API proxy must forward `/api/workspaces/*` without rewriting its path
   and permit streaming. A custom static frontend needs its SPA fallback on
   `/w/*` as well.
6. Sign in, verify the primary data is present, and switch to the empty
   secondary workspace. Import one synthetic lead, confirm that it appears
   only there, and delete that fixture. Keep two browser tabs open in different
   workspaces and confirm the URL, labels and data stay aligned. Repeat with
   accounts that have access to only one organization.

You can add agency leads manually, import a CSV or create an inbound source.
The public intake endpoint is
`POST /api/workspaces/voyd/webhooks/inbound/<source>`. Send JSON with that
source's own `x-api-key` header from the form's server. Use the mapping test
before enabling the source and verify one controlled delivery before accepting
agency enquiries. Keep the existing pharma webhook URLs in place.

Each secondary runtime uses the same database migrations, backup and restore
commands as the primary runtime. Store the workspace directory, private runtime
configs and individual recovery sets together. To stop access to a secondary
workspace, remove its entry from the directory and stop its service. Retain its
volume until its owner approves deletion. The primary data does not need to be
copied or changed to add or remove a workspace.

## Follow-up work

| Order | Work | Acceptance before rollout |
| --- | --- | --- |
| 1 | Rehearse the extra service next to a private copy of the Hostinger stack. Start with no agency sending credentials. | Pharma leads, background jobs and existing callbacks still work. Voyd starts empty. Owner, pharma-only and agency-only accounts pass read, write and download checks. Deliberately misrouted webhooks fail. Separate backups restore under the matching organization. |
| 2 | Connect the agency website's lead source. | One controlled enquiry lands only in Voyd and in the matching timeline. Verify duplicate suppression, failed-delivery retries and clean imports. Enable any welcome email separately. |
| 3 | Add workspace-specific routing for channel callbacks, MCP clients, mobile push and native Android. | A provider identifier or token can affect only the intended workspace. Receive, send, retry, notification links and revocation pass with two workspaces active. The pilot secondary routes support JSON lead intake, dashboard live updates and file downloads. |
| 4 | Add workspace creation and management in the dashboard and support built-in sign-in. | Creation provisions membership, storage and keys atomically. Creation, rename, invitation, export and archive work for authorized users and recover after interrupted provisioning. |

The pilot uses separately configured CRM runtimes in one installation. Limits,
backup coverage, and shared infrastructure still need review before offering
this to hosted customers.
