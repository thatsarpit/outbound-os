# Clerk production cutover

Outbound OS is one shared CRM workspace per installation. Clerk organization IDs
are not a tenant partition for leads, messages, orders or other CRM rows.
Set `CLERK_ORGANIZATION_ID` to the intended organization when using production
Clerk keys. HTTP and SSE reject other organizations and production keys without
that setting. The existing trusted MCP service token remains a separate
server-to-server administrator identity; never give it to browser clients.

## Permissions and Team

Clerk's built-in `org:admin` maps to application admin. `org:member` maps to sales
agent, which cannot administer settings, invite people or launch campaigns.
Existing custom admin/manager/agent/viewer memberships keep their current mapping
while a migration is reviewed. Unknown/missing roles receive no access. New
invitations accept only application `admin` or `agent`, mapped on the server to
the two built-in roles. A viewer or manager is never promoted automatically.

The Clerk Team view lists real organization memberships and pending invitations,
with provider pagination. Local password/enable/delete controls are unavailable
for Clerk accounts; changing an unrelated local User row cannot control Clerk
access. Existing membership changes are performed in Clerk's dashboard. Local
sign-in retains its four-role user editor. The legacy `/api/users` GET still
lists local numeric records used by existing assignment interfaces: it must not
be treated as the Clerk membership directory. Numeric local assignees are not
automatically linked to new Clerk identities by this change.

Live-update tokens pass Clerk's signature/expiry verification, normalize both
legacy and v2 organization claims, reject pending sessions, and use the same
workspace/role restrictions as HTTP. Role downgrades apply when a fresh session
token is issued; an already-open SSE connection is not forcibly revoked by this
change. Immediate stream revocation remains a separate improvement.

## Release gates

1. Preserve the existing instance/environment, owner memberships, and database.
   Keep both marketing gates off if rolling back to the old startup selector.
2. Verify production domain, DNS, TLS, email DNS and enabled sign-in methods.
   Development Apple/social credentials do not automatically work in production.
3. Establish the existing owner in the new instance through a supported migration
   or user-owned email-code sign-in. Do not create invitation emails merely to
   test the release. Record old/new organization and user IDs privately.
4. Enable organizations with built-in roles and explicitly assign the existing
   owner as admin. Pin the backend to that exact organization ID. Keep unrelated
   organizations and self-serve creation from granting access to CRM rows.
5. Preserve dashboard preferences using explicit owner-ID mappings. Browser
   drafts/preferences scoped to old user/org IDs require deliberate recovery;
   they are not safely migrated by changing all stored IDs globally.
6. Build with `npm run build:production --prefix web`. Run `npm run preflight`
   against the complete source tree and candidate production environment.
   The validator retains its live-key requirements and checks the current
   `favicon-outbound-os.svg` asset.
7. Verify owner login, organization selection, authenticated API reads, HTTP/SSE,
   member restrictions, logout, account changes and new-session role downgrades
   on a staging origin before changing production frontend/backend keys together.
   Browser emulation is not a physical iPhone Safari/Home Screen acceptance test.
8. Keep old images and keys available for rollback. Retain additive database
   columns. Do not reset the database or overwrite new customer activity.

This source change does not create users, change an active Clerk instance,
configure DNS, send invitations, migrate local assignments or prove owner login.
Track operational completion independently from merged code.

References: [production requirements](https://clerk.com/docs/guides/development/deployment/production),
[session claims](https://clerk.com/docs/guides/sessions/session-tokens).
