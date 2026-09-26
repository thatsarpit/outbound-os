# `order_shipped` — WhatsApp template

Purpose: the customer service window has almost always closed by the time an
order actually ships, so a free-form message cannot be delivered. Only an
approved template reopens the thread.

Submit in **Meta WhatsApp Manager → Message templates → Create template** (or AiSensy → Templates if you use AiSensy).

| Field | Value |
|---|---|
| Template name | `order_shipped` |
| Category | **Utility** |
| Language | English (`en`) |

> Category matters. Utility is for updates about an order that already exists —
> it is cheaper per message than Marketing and passes review far more often.
> Any promotional wording ("offer", "shop now", "discount") gets it reclassified
> as Marketing or rejected outright.

### Header — type `Text`

```
Your order has shipped
```

### Body

```
Hi {{1}}, your order {{2}} has been dispatched with {{3}}.

Tracking number: {{4}}
Estimated delivery: {{5}}

Reply to this message if you need the export documents or have any questions about your shipment.
```

### Footer

```
Acme Supplies · Your City
```

### Interactive Actions — `None`

No buttons, by choice. The reopening still works: the body asks for a reply, and
any inbound message — typed rather than tapped — opens a fresh 24-hour service
window, after which the live carrier link, invoice or airway bill can go out
free-form. A button would only have made that reply one tap instead of several.

A URL button was never an option anyway: WhatsApp allows a variable only at the
*end* of a fixed base URL, so a single template cannot point at both DHL and
FedEx without a `yourdomain.com/track/{{1}}` redirect existing first.

### Sample values (Meta requires these, and rejects obvious placeholders)

| Variable | Sample | Source |
|---|---|---|
| `{{1}}` | `Rick` | `SalesOrder.customerName`, first word |
| `{{2}}` | `PM-2026-0412` | `SalesOrder.orderNumber` |
| `{{3}}` | `DHL Express` | `Shipment.carrier` |
| `{{4}}` | `1234567890` | `Shipment.trackingNumber` |
| `{{5}}` | `12 September 2026` | `Shipment.estimatedDelivery` |

### Why this passes review

- The body opens with text, not a variable, and closes with text, not a variable
  — Meta rejects both.
- No two variables sit next to each other, which is also rejected.
- Every variable is a concrete order fact, so the reviewer can see it is a real
  transactional update rather than marketing dressed as one.

### After approval

Set `WA_CAMPAIGN_ORDER_SHIPPED` in `.env` to what your provider expects:

- **Meta Cloud API** — the template's name, e.g. `order_shipped`.
- **AiSensy** — create a **Campaign** wrapping the template and use the
  campaign name. A template name there returns `Campaign does not exist`.
