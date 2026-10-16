# Reviewed email batches

Automation uses an explicit manual launch. API startup, wake recovery and runtime
reconciliation never select a daily marketing audience. There is no daily selector
cron. Existing email queues and other channel workflows retain their own controls.

An administrator saves an allowed country list, a saved email template, selected
Brevo sender accounts, a batch maximum (1–200) and a per-sender maximum (1–150).
There are no inferred country, brand or sender defaults. Old installations must
save this policy before a new batch can launch. The upgrade does not enable delivery
or change existing consent, opt-outs, accounts or templates.

The country field accepts comma-separated names/codes. For example, `US, UK, AU`
selects United States, United Kingdom and Australia, including common aliases such
as USA, GBR and AUS. Unknown/blank lead countries do not match that audience. Other
workspaces can choose other countries.

## Review and launch

1. Save the batch policy in Automation.
2. Select **Preview batch**. Preview works with delivery disarmed and does not
   write defaults, reset counters, edit templates or create provider resources.
3. Review the saved template, country audience, recipient list and exact sender
   allocation. Eligible unique addresses is the full matching population; the
   preview count additionally applies the batch, sender and shared-provider caps.
4. An administrator can send the reviewed batch after the launch permission and
   Brevo delivery gates are ready. A changed audience/allocation/template or personalized content requires
   a new preview. A global pause still blocks delivery.

The server deduplicates normalized addresses, excludes previous queued/accepted
email exposure and suppresses an address if another lead row is opted out, paused,
closed, replied, engaged or email-suppressed. It scans all candidate pages rather
than stopping at 3,000. Final eligibility, selected policy and sender readiness are
checked again immediately before each provider send request. A reply or opt-out
during provider draft creation blocks that unsent sender group.

Templates support `name`, `product`, `country`, `company`, `email` and their `lead.`
forms. Other variable names block launch rather than silently rendering blank.
The Brevo unsubscribe placeholder remains intact. The provider campaign uses the
saved template; local message history records its recipient rendering and version.
A saved provider draft is bound to its recipient identities, country policy and
template/content hashes. Legacy or changed drafts require review; they are never silently
converted to another audience or brand.

## API compatibility

The existing `/api/email/daily/*` URLs remain available:

- `GET status`: manager access; read-only settings, policy, unique eligibility,
  selected sender IDs, available accounts, delivery gates and manual launch copy.
- `PATCH settings`: administrator access; validates the complete patch before
  atomically storing fields. No template creation or email dispatch.
- `POST preview`: manager access; returns recipients and `previewHash`.
- `POST queue`: administrator access; requires the reviewed `previewHash` in the
  request body. Missing or changed previews do not send. `force` cannot bypass the
  country/template policy, suppression, explicit launch permission or provider gates.

The once-per-workspace-day launch marker remains. This change does not add a
campaign-run ledger or automatically resume partially accepted batches. If a launch
fails or creates unsent provider drafts, inspect provider state before retrying.
Historical campaigns, delivery-event reconciliation and notification accuracy are
separate audit work, not retroactively repaired by this upgrade.

## Validation and rollout

Regression tests use fake recipients and an in-memory Brevo transport against a
throwaway migrated SQLite database. Coverage includes 200 recipients split 50 each
across four senders, wrong/blank countries, duplicate opt-outs, more than 3,000
previously contacted duplicates, stale previews, saved template rendering, late
opt-outs, read-only status/preview, atomic validation and startup/wake/manual recovery.

Deploy the API before the matching dashboard. No database migration is required:
new policy values use the existing SystemConfig table. On production, verify status
reads do not change templates/counters and that recovery records
`explicit_launch_required`. Configure the intended saved policy, then inspect a
preview. Do not use a real outreach send as a deployment smoke test.
