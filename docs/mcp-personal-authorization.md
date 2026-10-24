# Personal MCP authorization

Status: implemented as an **opt-in, administrator-only, read-only** mode. Existing installations remain in legacy mode until an operator configures, tests and explicitly activates the new mode. This document does not record a production cutover or live-client acceptance.

## What changes

New personal connections use the existing dashboard sign-in provider, an explicit Allow read-only access screen and a revocable grant. No second access password is needed in personal mode. The client can read leads, messages, campaigns, team data and reports; it cannot send, import, edit, delete or start/pause campaigns. These write permissions remain a separate implementation task and are not presented as available checkboxes.

ChatGPT and Codex are grouped under OpenAI in the setup UI, but authorize separately. The copied setup prompt contains only the public server URL and instructions. It cannot install an MCP connection on clients that provide no installation tool, and cannot approve consent for the person.

## Activation configuration

Set the following on **both** API and MCP containers. Values below are examples, not real credentials.

```dotenv
MCP_AUTH_MODE=personal
MCP_PUBLIC_URL=https://mcp.example.test/mcp
MCP_DASHBOARD_ORIGIN=https://app.example.test
MCP_WORKSPACE_ID=your-stable-installation-id
MCP_CONTROL_SECRET=<separate-random-secret-of-at-least-32-characters>
MCP_LEGACY_COMPAT=true
```

`MCP_CONTROL_SECRET` must be independently generated and distinct from dashboard signing keys, the legacy service token and client credentials. Send it only over a trusted container network or HTTPS to the private API control routes. Keep those routes off public proxy routing where practical; they also authenticate the secret and are rate limited.

Apply the `McpAuthorizationStore` migration before enabling the mode. The API alone writes the SQLite-backed authorization ledger. Do not mount the database into the MCP container. The MCP process retains `BACKEND_URL` for private control/API calls. The proxy must preserve the public Host and supply a trusted HTTPS protocol; personal OAuth rejects a conflicting issuer host.

For Clerk, pin `CLERK_ORGANIZATION_ID` to the installation's existing organization. No identity migration, plan upgrade or passkey setup is required for this flow. The backend rechecks current Clerk membership and user status at approval, code/refresh exchange and tool/API use; Clerk unavailability fails closed. Local sign-in rechecks the enabled User row and role instead.

The dashboard must serve `/integrations/mcp/authorize` through the normal authenticated route, preserving the internal path when sign-in is needed. Serve this HTML and its JSON with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and frame denial. The API routes enforce exact configured dashboard Origin for approval and revocation.

## Legacy compatibility and rollback

The default/unset `MCP_AUTH_MODE` is `legacy`; existing tokens and logins are unchanged. With personal mode active, `MCP_LEGACY_COMPAT=true` explicitly retains the static bearer, existing legacy OAuth access tokens and legacy refreshes. New registration and authorization use personal mode. The old shared-password authorize POST is disabled in personal mode.

Legacy tokens have no trustworthy individual owner or granular permission history. They are not displayed as personal grants and remain shared administrator access. The UI labels this difference. Do not claim that the read-only grant limits these old credentials. After a personal owner connection works in the real clients, set `MCP_LEGACY_COMPAT=false` in the MCP container to stop accepting legacy credentials. Preserve the old OAuth store for an explicit rollback; do not silently erase it.

Legacy `list_users` discovers provider-scoped `memberKey` values from the workspace directory. Pass one as `lead_assign.member_key`, or pass `member_key: null` to unassign. Numeric `user_id` remains supported only with local sign-in. Clerk installations require the existing organization to be pinned; each explicit target is checked against current membership and user status. Shared service administrators cannot claim a conversation as themselves, authorize personal grants or acquire a personal identity. During a staggered API upgrade, discovery falls back to the older local user list only when the workspace directory returns 404, never on a permission or provider failure.

Rolling back to legacy mode disables personal control routes and personal delegated API access. Personal grants stay in the database but cannot be used while the mode is disabled. Keep canonical URLs, installation ID and keys stable across restarts; changing the installation ID invalidates old grants rather than attaching them to a different workspace.

## Security and lifecycle

- The API stores a bounded, versioned ledger in one compare-and-swap row. Each issuance, code consumption, refresh rotation and revocation commits atomically before its result is returned. CAS conflicts retry at most eight times and then fail safely. SQLite remains owned by the API.
- Client callbacks must exactly match a registered URL, including path/query/port. HTTPS and literal loopback HTTP callbacks are allowed for registration. There is no trusted-brand wildcard or unregistered loopback exception.
- Authorization parameters are scalar/bounded, `response_type=code`, exact resource and S256 PKCE are required. Only `mcp:read` is accepted. Dynamic registration remains supported; CIMD is not advertised as implemented.
- Five-minute requests bind immutable OAuth parameters to a random, Secure/HttpOnly/host-only/SameSite=Lax browser cookie. A request ID alone cannot approve, complete or issue access. Personal approval uses a one-use, account-bound decision nonce and exact Origin. Cancellation creates no grant.
- Codes and all access/refresh credentials are stored hashed. Codes are one-use, expire in five minutes and require the exact client, redirect, resource and PKCE verifier. OAuth state is preserved and issuer identification is returned.
- Access lasts at most 15 minutes. Refresh tokens rotate, expire after seven days idle and have a 30-day absolute grant/family limit. Consumed hashes remain until family expiry, so replay revokes the entire family, including newer access tokens.
- Revocation and current role are checked at every tool/API operation. Disabling/removing/downgrading an owner stops future operations. Dashboard logout alone does not revoke deliberately authorized background connections.
- Request context uses AsyncLocalStorage, never a global current user. Personal MCP resource tokens cannot authenticate directly to API routes. The control channel exchanges them for 30-second assertions bound to the API audience, installation, grant, tool, HTTP method and exact path. The API independently checks signature, grant/token state, scope and live owner membership.
- Unknown tools and mutations fail closed at both catalogue and API boundary. Existing legacy tools are unaffected only when compatibility is explicitly enabled.
- Personal grants expose real creation/revocation/last successful tool timestamps. Successful reads and failures emit bounded audit events with actor, grant, client, tool, result and correlation ID, without message bodies or credentials. Result-event persistence failures are logged and can leave last-used timestamps incomplete; authorization itself fails closed on storage failure.
- Bounded retention: 1,000 registered clients, 1,000 pending requests, 500 live/recent grants, 10,000 access and refresh entries each, and 500 audit events. Expired entries prune on use. This ledger is appropriate for the current single-installation deployment; larger deployments should move to typed indexed tables and an external audit retention policy before raising limits.

## Acceptance before activation

Automated tests cover parser/redirect/PKCE checks, same-browser completion, same-origin personal consent, service-identity rejection, disk failure, atomic code use, refresh replay, live role/removal, immediate revocation, signed API delegation, tool catalogue parity and legacy transport compatibility. The real API middleware test checks parsed control/consent JSON before the broad API guard, concurrent SQLite code use and refresh rotation, a newly constructed service reading the same ledger, live local-account changes and immediate family revocation. Fixtures use temporary databases/listeners and no customer providers.

Remaining release acceptance: actual Clerk dashboard sign-in/consent with the pinned organization, a real ChatGPT web connection, a separate Codex OAuth connection, normal proxy/Host behavior, restart persistence, lost callback recovery and rollback. Use only `system_status` / `whatsapp_accounts` for live checks. No customer send is required. Browser/iPhone acceptance was not performed during the source implementation.
