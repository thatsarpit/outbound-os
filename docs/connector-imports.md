# External imports and lead attribution

Outbound OS accepts a generic source contract. Seller-site adapters, browser
sessions and export collection belong in separate, privately deployed services.
There is no marketplace-specific login, scraper, preset or messaging channel in
the application.

## Upgrade

Back up the database and encryption key, stop the previous application image,
and run the committed migrations with `npx prisma migrate deploy`. Start the
compatible new image only after migrations succeed. Do not use `db push` or
rewrite previously applied migrations.

The migration adds a receipt ledger, lead origin and order origin. Old
first-touch template labels are normalised so earlier outreach remains
recognised; the upgrade must not create a second first-contact message.
Historical migration files and original customer records retain their
provenance. This cleanup does not delete conversations, tags or customer data.

The removed preset is no longer offered on new installations. Existing custom
webhook sources remain data; review their field maps and cut over explicitly to
the generic contract. Vendor-specific envelopes are no longer inferred. A
source can still supply an explicit field map for its own payload.

## Set up a source

An admin can use **Integrations → Webhooks → Add Source**. Save the source key
from the creation dialog: it is displayed once, with reveal and copy controls.
Then choose **Configure imports**, select an enabled origin supplier and add
any additional tags. The source card will show its historical import URL.
Use that URL for the bridge; the live inbound URL follows normal outreach rules.

The equivalent creation API is `POST /api/webhooks/sources`. Configure the pool
that should own imported contacts through the source API before importing.
The key is returned once; do not put it in a URL, repository, screenshot or log.

Configure attribution with:

```http
PATCH /api/connector-sources/<source-id>
Content-Type: application/json

{"supplierId": 123, "tags": ["partner-example"]}
```

Use the actual existing supplier ID and tag spelling. The number above is an
example. Supplier assignment and tags come from this trusted source
configuration, never from an export row. No supplier name is built into the
product. Supplier records are not automatically created by the importer.

## Send records

```http
POST /api/webhooks/connector/<source-slug>
Content-Type: application/json
x-api-key: <source-key>

{
  "records": [{
    "externalId": "enquiry-001",
    "name": "Example Buyer",
    "mobile": "+15550000001",
    "email": "buyer@example.test",
    "company": "Example Team",
    "country": "US",
    "product": "Example product",
    "quantity": "10 units",
    "acquiredAt": "2026-01-01T12:00:00Z"
  }]
}
```

Maximum 50 records per request and 512 KB total. Every record needs a stable
source enquiry ID and a phone or email. Use international phone numbers and
timestamps with a known timezone. Date-only source cards should not be turned
into guessed times. Optional `notes` retains up to 4,000 characters of source
context. Every source enquiry receives its own receipt even when several
enquiries belong to one contact.

The response includes each source ID, `state`, `leadId` when matched and
`outreachQueued: false`. States are:

- `created`: new contact, paused, no marketing consent and no queued outreach.
- `matched`: an unambiguous contact exists. Only blank contact fields are
  filled; status, ownership, opt-out and consent are preserved. The configured
  source tag and origin supplier are attached.
- `conflict`: multiple contacts match, contact identifiers disagree, the pool
  differs, or another supplier owns the contact. The receipt retains the row
  and reason; no contact is modified.

Replaying an enquiry returns its original receipt, including conflicts. A
conflict therefore requires deliberate human resolution; redelivering it does
not approve a merge. Changed source data is not silently applied to an already
acknowledged receipt. Review it as a separate correction.

## Review and report

Managers can use **Integrations → Webhooks → Import records** to filter
conflicts, new contacts and matched contacts, inspect retained source fields
and page through the ledger. This is a review view; it does not approve merges.
Admins can disable intake on the source card without deleting its history.
Deleting a source with receipts is rejected, including during concurrent imports.

The equivalent API is
`GET /api/connector-receipts?sourceId=<id>&state=conflict&page=1`.
Each page contains up to 100 receipts. Keep exports of these records private.

The Leads table shows the origin supplier below the source. Existing tag
filters remain available. The API can filter exactly by
`GET /api/leads?originSupplierId=<id>`.

When creating an order from a lead, the server snapshots that lead's
`originSupplierId`. Orders have an **All lead suppliers** filter, and show
**Lead from …** beside the customer. The order's fulfilment `supplierId` is
independent: a lead origin and the supplier shipping the goods need not be the
same business. Later tag edits do not rewrite an order's recorded origin.

This attribution supports commission reconciliation, but does not invent
commission percentages, payment status or terms. Old orders retain their
existing records; retrospective attribution needs a separately reviewed
reconciliation. Never infer settled commission from a mutable lead tag.

## Activation

First test a synthetic record, replay it, verify the paused contact and receipt,
and check that no messages were queued. Historical imports stay paused. A
future live-only outreach mode needs an explicit cutover timestamp, freshness
checks, reviewed consent/templates and an owner-controlled delivery test.
Importing history is not permission to contact all historical buyers.

No production configuration, import or send is performed by preparing this
branch. The private export bridge is maintained outside this repository and
does not access a seller website.
