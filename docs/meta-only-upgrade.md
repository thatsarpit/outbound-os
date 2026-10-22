# Direct Meta upgrade and website service enquiries

Outbound OS sends WhatsApp messages directly through Meta's official Cloud API.
The retired transport, webhook and dashboard controls have been removed.

## Before upgrading an existing instance

1. Back up the SQLite database, environment files and encryption key, and verify
   the backup. Stop the previous API image before applying schema changes.
2. Review each sending number's Meta phone ID, token, WABA and approved template.
   Existing direct Meta accounts keep their credentials, IDs and history.
3. Build the new image and apply committed migrations with
   `npx prisma migrate deploy`. Do not use `prisma db push` or change the checksums
   of migrations that already ran.
4. The migration disables accounts using the retired transport and removes its
   credential columns. An invalid default template label, such as one containing
   spaces or capitals, is cleared. Choose the exact approved Meta template name
   before using automatic first contact. Clearing it does not send any message.
5. Configure the Meta webhook at `/webhook/meta`, with the matching app secret
   and verification secret, and subscribe the app to `messages`. The old
   `/webhook/whatsapp-cloud` route is removed.
6. Remove unused retired-provider variables and sync jobs from your deployment
   configuration. They are not read by the new code. Do not delete historical
   customer messages, provider IDs or backups as part of this cleanup.
7. Start the new image, check health, then test incoming and outgoing messages
   with an owner-controlled recipient before starting any campaign.

The upgrade retains all conversations and account relationships. Historical
import snapshots and unmatched records are retained under the inert
`whatsapp.import_archive.*` configuration keys; active sync configuration is
removed. Old migration files remain immutable so existing installations can
verify their migration history. Removal regression tests and HTTP redirects
also retain the old provider identifiers where necessary.

The new schema drops obsolete credential columns. Rolling back requires the
pre-upgrade database **and** compatible image together. Retain that backup
privately; do not put it in source control.

## Paid setup and hosting enquiries

The website offers free self-hosting plus paid setup, managed hosting and
assistance. Prices and service scope are quoted per customer. The website does
not create subscriptions or bill a customer.

The public intake is disabled by default. To enable it on the API instance that
should receive website enquiries, set:

```dotenv
WEBSITE_ENQUIRY_ENABLED=true
WEBSITE_ENQUIRY_ORIGINS=https://outboundos.space,https://www.outboundos.space
```

Build the static website with `NEXT_PUBLIC_API_URL` pointing to that API. The
checked-in default and Cloudflare CSP use `https://api.outboundos.space`. If the
hostname changes, update `connect-src` and `form-action` in `website/public/_headers`.

Test with a synthetic enquiry. It should appear as a **paused** lead with source
`website_service_enquiry`, no marketing consent and no queued outbound messages.
The form has input limits, a honeypot and a per-IP rate limit. Origin checking
limits browser use; it is not authentication for a public endpoint. Review these
records in the CRM and respond manually. An unavailable intake offers an email
draft instead of claiming the enquiry was received.

No production migration, environment change, template selection or campaign send
is performed merely by preparing or reviewing this branch.
