# IndiaMART relay for this Mac's Chrome profile

The agent could not observe IndiaMART because its browser security policy blocks
that site. This extension was built and tested with offline fixtures. **The owner
must load and activate it manually.** No IndiaMART browser content, cookies or
passwords were read to build it. It is not installed or active just because its
files are present.

## One-time setup

1. In your **Arpit** Chrome profile, open `chrome://extensions`, turn on Developer
   mode, choose **Load unpacked**, and select this entire folder. Keep the folder
   in place. The extension requests access only to seller.indiamart.com and
   api.outboundos.space, plus local storage, alarms, site-script execution and
   background operation. It does not request cookies, history or debugger access.
2. Open **Outbound OS · IndiaMART Relay** from Chrome's extensions menu. Choose
   **Check signed-in account**. It reuses that profile's normal IndiaMART login.
   If the login expired, use **Open IndiaMART login** and sign in yourself.
3. Confirm that the page/account is Panchsheel Medicals, tick the confirmation
   box, then choose **Confirm account and start**. The first scan imports a
   non-sending baseline and pins that seller ID. Subsequent new purchases can
   queue the approved liveleadloutreach WhatsApp template on account 1 and email
   on Panchsheel sender 1. Sales email passes the free verifier before sending.
   No historical/duplicate contact is automatically resumed.
4. For automatic Chrome startup, double-click **Enable startup.command**. Read
   the last folder of **Profile Path** in `chrome://version` from the same Arpit
   profile and enter it when prompted (for example `Default` or `Profile 1`).
   This installs a user LaunchAgent that opens that profile quietly at login
   and every 15 minutes while awake. **Disable startup.command** removes it.
   The helper never reads browser cookies, saved passwords or other profiles.

Chrome may show a standard warning for an unpacked extension. It is local code
from this reviewed project, not a Chrome Web Store installation. Do not bypass
an OS or browser security block. If loading is blocked, stop and ask the owner
or administrator to review it normally.

## Sleep, wake and outages

- Nothing runs while the Mac is asleep, shut down or before you log into macOS.
- With Chrome running, a missed alarm fires after wake. The relay recreates its
  15-minute alarm whenever its service worker starts; a profile restart also
  triggers a check. It does not rely on a fragile JavaScript interval.
- A background tab is used temporarily. If there are no Chrome windows, the
  temporary window is minimized and unfocused. It is closed after the scan;
  an already open purchased-leads tab is reused without changing its contents.
- Progress and pending imports are saved in this profile's extension storage.
  They resume after restart or network failure. Stable purchase IDs are also
  recorded permanently in Outbound OS, so a lost acknowledgment is safe to retry.
- Catch-up reads up to 420 unseen purchases until a known ID is found. An
  unavailable/malformed later page or larger gap stops before cursor advancement
  and shows an attention badge, rather than silently skipping leads.
- All missed purchases in that window are imported. Automatic outreach applies
  only to genuinely new contacts bought after the baseline and within the last
  seven days. Older purchases are imported without outreach. An edited, paused,
  replied, opted-out or conflicting contact remains protected.
- An expired login or changed seller account needs your intervention. The
  extension shows an attention badge; Hermes's system_status shows the cloud
  health report. A stale health report means the Mac/Chrome may be offline.
- **Pause relay** stops new intake checks. Messages already accepted/queued by
  Outbound OS must be paused separately in the CRM if you want to stop sending.

## Private connection and removal

`connection-private.json` is a source-scoped CRM credential. Keep it local and
private; do not upload, commit or paste it into a chat. It is never injected into
IndiaMART's page. Only this extension's own options page can enable the relay.
Customer data is sent only to your fixed HTTPS Outbound OS intake endpoint.
Chrome's ordinary login cookies remain in Chrome.

To stop: click Pause relay, remove the extension in chrome://extensions, then run
Disable startup.command if you enabled the startup helper. Removing the extension
clears its local ledger; the CRM still retains permanent purchase receipts. Do
not reset storage to repair a stuck run—read its status first. The AWS Chromium
container remains stopped; no paid infrastructure or proxy service was added.

Sources:
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
