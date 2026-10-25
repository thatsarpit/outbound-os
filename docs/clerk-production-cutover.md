# Clerk production cutover

Outbound OS is one shared CRM workspace per installation. Clerk organization IDs
are not a tenant partition for leads, messages, orders or other CRM rows.
Set `CLERK_ORGANIZATION_ID` to the intended organization when using production
Clerk keys. HTTP and SSE reject other organizations and production keys without
that setting. The existing trusted MCP service token remains a separate
server-to-server administrator identity; never give it to browser clients.

## Operational status — 25 October 2026

The production cutover is complete for owner sign-in in release 0.4.0. #53 and
#63 are merged and deployed in the API/MCP images and production dashboard at
`e5db03d`. The existing owner signed in to the intended workspace, authenticated
API reads passed, and the EventSource connection accepted the owner's signed
session. Google account linking and dashboard access were confirmed on that
existing owner identity. Email sign-in and Clerk branding remain available.

Existing notification state was transferred deliberately before startup; core
record counts were preserved. Legacy MCP authentication and issued credentials
were retained. This records completed owner/login acceptance, not complete
real-team role-change, account-recovery or physical iPhone Safari/Home Screen
acceptance. Personal MCP activation, passkeys and Gmail/Outlook OAuth mailbox
connections remain separate work. No paid feature was activated.

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

## Upgrade checklist

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

Applying source alone does not configure a Clerk instance, DNS, memberships or
identity mappings. The operational record above describes the verified release;
repeat the checklist for another installation or a later identity change.

## Passkeys and sign-in appearance

The login uses Clerk's prebuilt `SignIn` component inside the app's dark layout.
Clerk controls enabled sign-in strategies, email-code fallback, recovery, session
tasks and passkey authentication. Its footer branding and development notice are
visible; only the sign-up action is hidden on this existing-member entry page.
Configured social providers are visible alongside email, using Clerk's actual
buttons with the app's dark theme and at least 44px touch targets. The production
Google connection was accepted for the existing owner; enabling sign-in does not
grant Gmail mailbox access.
Clerk's current Hobby plan does not include removing branding or production
passkeys. Do not enable a paid feature or change plans as part of a UI release.

Account → Passkeys reads only the documented public Frontend API environment
setting, without sending dashboard credentials or cookies. An unknown, failed or
disabled capability cannot show Add passkey. Enrollment also requires WebAuthn in
a secure context. A development instance on a public domain is deliberately
blocked until the production cutover above is complete; localhost development
can exercise the flow separately. A positive capability response is not proof
that a plan, relying-party domain or physical-device ceremony is valid.

After production domain and plan settings are reviewed and approved:

1. Enable passkeys in the correct production instance while retaining email-code
   sign-in. Confirm its domain/relying-party configuration matches the everyday
   app origin. Do not create a passkey in an unrelated Account Portal or preview
   domain and assume it will work on the app domain.
2. Sign in on the intended iPhone Safari or installed Home Screen app with email.
   Open Account → Passkeys → Add passkey. Complete the system prompt yourself;
   choose Passwords/iCloud Keychain if offered. The app cannot choose or inspect
   the user's password manager or biometric data.
3. Confirm the passkey appears on the personal account. Cancel a second creation
   attempt and verify that no success message or extra credential appears. Clerk
   reverification, if required, remains in Clerk's supported modal flow.
4. Sign out, use Clerk's passkey option on the same app origin, and verify the
   signed-in user, intended organization and authenticated API access. Verify
   email-code fallback and conversation-return navigation independently.
5. Review or remove test credentials through Clerk's security settings. Confirm
   a browser without passkey support and an unavailable settings request both
   retain a working sign-in fallback. Verify CSP/proxy rules allow the configured
   Clerk script and Frontend API origins before shipping a self-hosted frontend.

Automated tests cover capability parsing, credential-free settings requests,
development/domain and browser gates, and truthful failure states. They do not
claim a completed iCloud Keychain enrollment, successful Face ID sign-in, paid
plan configuration or full physical-device acceptance. Completed production
owner sign-in is recorded separately above.

References: [production requirements](https://clerk.com/docs/guides/development/deployment/production),
[session claims](https://clerk.com/docs/guides/sessions/session-tokens),
[passkeys](https://clerk.com/docs/guides/development/custom-flows/authentication/passkeys),
[Frontend API](https://clerk.com/docs/reference/frontend-api),
[sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options),
[Clerk pricing](https://clerk.com/pricing).
