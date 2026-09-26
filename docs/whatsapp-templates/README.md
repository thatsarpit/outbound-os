# WhatsApp template samples

Approved templates are required for any WhatsApp message outside the 24-hour
window after a customer last wrote to you — first contact, follow-ups to cold
leads, and order updates. These are worked examples that passed Meta review,
with the variables Outbound OS fills in.

| Template | Sent when | Setting |
|---|---|---|
| [order_confirmed](order_confirmed.md) | An order is confirmed | `WA_CAMPAIGN_ORDER_CONFIRMED` |
| [order_shipped](order_shipped.md) | A shipment gets tracking | `WA_CAMPAIGN_ORDER_SHIPPED` |
| [order_delivered](order_delivered.md) | A shipment is delivered | `WA_CAMPAIGN_ORDER_DELIVERED` |

For first contact with new leads, create a template whose body uses `{{1}}`
for the lead's first name and `{{2}}` for their country, then set it as the
number's **First-contact template** in Settings → WhatsApp.

Meta charges by the recipient's country and the template category; utility
templates (order updates) cost far less than marketing ones. Check Meta's
current rate card before budgeting.
