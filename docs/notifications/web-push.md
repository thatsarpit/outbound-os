# iPhone and browser notifications

Outbound OS can notify a signed-in person about new customer messages on WhatsApp, email, iMessage and Telegram. The existing API process checks the database every 30 seconds. No extra container or notification service account is required. Email alerts wait for the configured mailbox sync to import the reply.

## Server setup

1. Generate a VAPID key pair once with `node scripts/generate-web-push-keys.mjs`. Redirect the output into a private file outside source control.
2. Set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and a real `WEB_PUSH_SUBJECT=mailto:you@example.com` in the server environment. Preserve the key pair across releases.
3. Apply the committed migrations and restart the API. Deploy the dashboard from the same revision; it includes `/push-sw.js`.
4. Serve the dashboard over HTTPS. Check that `/push-sw.js` returns JavaScript, rather than the SPA HTML fallback. The worker must have root scope. Its registration URL includes a content version and uses updateViaCache=none; worker responses explicitly bypass browser/CDN storage. This avoids an old worker being retained by a custom-domain cache.

Device subscriptions are encrypted using the existing `LEAD_SYNC_ENCRYPTION_KEY` (or configured JWT secret). Back up that key with the database. Changing the encryption key makes stored subscriptions unusable. Changing VAPID keys requires people to disable and enable notifications again.

## iPhone setup

Use iOS 16.4 or later. Open the dashboard in Safari, choose Share → Add to Home Screen, then open the installed icon and sign in. Open More → Device notifications → Enable notifications and approve the iOS prompt. Permission is requested only after tapping the button.

Use Send test, then inspect Notification Center. Also test with the app backgrounded and the phone locked. An accepted provider request does not prove that a physical phone displayed its alert: Focus, notification permissions and device connectivity affect delivery.

The Home Screen icon is supplied by the existing Apple touch icon and manifest assets. An old shortcut may retain its previous icon; remove and add that shortcut again if necessary. A paid Apple Developer Program membership is not required for Web Push.

## Behavior and privacy

- Each device belongs to a personal user/workspace identity. The shared MCP service token cannot register a device or change a person's read state.
- Notifications start after registration; existing inbox history is not replayed.
- Outbound campaign emails, delivery reports and classified automatic email replies do not trigger customer-message alerts. Legacy unclassified inbound messages retain their existing classification.
- Reading the latest message in the foreground suppresses its subsequent device alert. Reading does not resolve a conversation or change the sales pipeline.
- Alert bodies contain a generic prompt to open the workspace. Customer names, contact details and message text are not put on the Lock Screen.
- Tapping an alert opens the corresponding mobile conversation. Normal sign-in and API authorization still apply. The worker does not store tokens or cache CRM responses.
- Delivery progress is stored per device. Temporary provider failures retry; HTTP 404/410 removes expired subscriptions. Retries share a message notification tag to limit duplicate banners after a crash.
- Local enabled-user/role checks and Clerk organization membership checks run before background delivery. An unavailable authorization provider defers delivery.
- Signing out unsubscribes the browser and requests removal of its server registration. Devices can also be disabled from Account or OS notification settings.

This release sends background push for customer messages. Task reminders, campaign milestones and system-error push preferences are not included. The in-app notification center continues to show the existing activity feed. This remains a single-workspace installation, not a tenant-isolated hosted service.

## Verification

Unit tests cover endpoint destination validation and encryption/tamper detection. API integration tests cover personal ownership, MCP denial, read-state suppression, retries, durable cursors and expired subscriptions with mocked delivery. These tests do not claim a live Apple/Google delivery test.

References: [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit's iOS requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [web-push library](https://github.com/web-push-libs/web-push).
