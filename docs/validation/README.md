# Verification evidence

Keep these records sanitized. Use fake contacts and test environments; never
store webhook keys, authorization tokens, OAuth stores, or customer exports.

| Area | Verified | Still requires a real installation/provider |
|---|---|---|
| Contact Form 7 + CF7 to Webhook | Published form submission, header authentication and duplicate submission in isolated WordPress containers; see `wordpress-webhook.json` | Confirm the installed add-on's current UI and public HTTPS delivery |
| Typeform, Tally and Google Forms | Payload mapping, reordered fields, webhook authentication and replay deduplication in unit/API tests | Submit from each hosted provider and retain a redacted delivery record |
| Webflow and WPForms | Documented builder steps and shared inbound form/JSON handling | A published builder submission and lead verification |
| Nginx | `npm run test:proxy` exercises the published configuration against the CRM and Debian Nginx, including authentication, forwarding and immediate SSE delivery; runs in Docker CI | Domain DNS, Certbot issuance/renewal and the installation's proxy trust addresses |
| Mobile sales workspace | Browser sample flows, narrow/landscape/shortened viewport, draft failures, notes/tasks; API and storage regression tests | Physical iPhone Safari/Home Screen login, keyboard and native Photos/Files picker |

Do not describe contract tests as a live provider test. An issue requiring a real
provider submission stays open until that final evidence is available.
