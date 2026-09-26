# `order_delivered` — WhatsApp template

Fires when a shipment is marked delivered. This is the single best repeat-order prompt you have, because it reopens the thread at the moment the customer has the goods in hand.

| Field | Value |
|---|---|
| Template name | `order_delivered` |
| Category | **Utility** |
| Language | English (`en`) |

### Header — type `Text`

```
Order delivered
```

### Body

```
Hi {{1}}, your order {{2}} has been marked delivered by the carrier.

If anything is missing or damaged, reply to this message and we will sort it out.
```

### Footer

```
Acme Supplies · Your City
```

### Interactive Actions — `None`

No buttons. Any inbound reply reopens the 24-hour window, and the body asks
for one.

### Sample values

| Variable | Sample | Source |
|---|---|---|
| `{{1}}` | `Rick` | SalesOrder.customerName, first word |
| `{{2}}` | `PM-2026-0412` | SalesOrder.orderNumber |

### After approval

Set `WA_CAMPAIGN_ORDER_DELIVERED` in `.env` to what your provider expects
(default `Order Delivered`): the template's name on the Meta Cloud API, or on
AiSensy the name of a Campaign wrapping the template (a template name there
returns `Campaign does not exist`).
