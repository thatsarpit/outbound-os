# Mobile sales workspace

The web dashboard includes a focused phone workspace at `/m/inbox`. Phone visits
to Overview, Inbox and Leads open it automatically. The profile menu links to
the full dashboard, account preferences and Home Screen instructions.

The three mobile destinations are:

- **Inbox:** shared workspace conversations, Needs reply / All, channel filters,
  search and paginated results. A conversation opens full-screen. Email sender,
  subject, CC/BCC, templates and attachments are behind Options. Lead details,
  notes and follow-ups are available from the conversation header.
- **Tasks:** pending workspace follow-ups, overdue counts, completion and links
  to their leads. Open a lead to add another follow-up.
- **Leads:** searchable contacts, contact details, conversation access, phone
  calls, notes and follow-ups.

This version intentionally omits campaign creation, mass sends, integration
setup, reporting and administration from phone navigation. These remain in the
full dashboard. Assignment to the current Clerk user is not exposed because the
backend does not yet map Clerk identities to numeric local user assignments.
The queues are shared workspace queues, not personal or organization-isolated
queues. “Needs reply” is based on the latest visible message; there is no separate
per-person read/unread state.

## Drafts and connectivity

Reply drafts are saved locally on each edit, scoped to the signed-in person,
workspace, lead, channel and sender account. They expire after seven days and
are cleared on explicit sign-out. Sending clears only the submitted revision,
so a slow result cannot delete a newer draft. Storage failures are visible.
Provider rejections preserve the draft. Shared query caches are discarded on account/workspace changes and role changes, and the protected shell remounts to clear in-memory editor state. Files must be reattached after reopening
a conversation; this version does not store files or confidential API responses
for offline use. Pending uploads block Send and sender/channel changes.

An internet connection is required. Writes fail immediately when disconnected;
there is no offline send queue or background transmission. Visible queries
refresh on foreground/reconnect, with periodic inbox refresh while the app is
open. Background push notifications are not implemented.

Follow-up dates use the workspace time zone returned by `/api/config/brand`.
The picker labels that zone and converts its wall-clock time to UTC for the API.
Missing or repeated times during a daylight-saving clock change require the
user to choose another time.

## iPhone installation and release checks

Open the HTTPS app in Safari, choose Share → Add to Home Screen, leave Open as
Web App enabled when shown, and open the new icon. The manifest starts at
`/m/inbox`; normal sign-in and permissions still apply. No service worker caches
authenticated CRM data.

Before a production rollout, deploy the inbox/task API fixes and then the
frontend bundle with the production authentication configuration. Verify on an
actual iPhone 13 in Safari and from its Home Screen icon:

1. Sign-in, sign-out and reauthentication, including returning from another app.
2. Email/WhatsApp reply, sender switching and draft restoration after backgrounding.
3. Keyboard opening, rotation, safe areas and expanded email options.
4. Photos/Files attachment selection, upload failure, removal and authenticated downloads.
5. Workspace due dates, note creation and follow-up completion.
6. Offline failure, reconnect refresh and provider errors without duplicate sends.

The browser preview uses sample data only. Sample replies, notes and tasks stay
in memory; template rendering uses the same response contract as the API. A
reply containing `[demo-fail]` simulates a provider rejection for draft testing.
