# `order_confirmed` — WhatsApp template

Fires when an order moves to confirmed. Sets the expectation that a tracking message is coming, which reduces "where is my order" messages later.

| Field | Value |
|---|---|
| Template name | `order_confirmed` |
| Category | **Utility** |
| Language | English (`en`) |

### Header — type `Text`

```
Order confirmed
```

### Body

```
Hi {{1}}, we have confirmed your order {{2}}.

Order total: {{3}}

We are preparing it for dispatch and will send tracking details as soon as it ships. Reply to this message if anything needs changing.
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
| `{{3}}` | `USD 1,240.00` | SalesOrder.total + currency |

### After approval

Set `WA_CAMPAIGN_ORDER_CONFIRMED` in `.env` to what your provider expects
(default `Order Confirmed`): the template's name on the Meta Cloud API, or on
AiSensy the name of a Campaign wrapping the template (a template name there
returns `Campaign does not exist`).
