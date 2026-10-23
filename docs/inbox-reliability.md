# Inbox reliability and WhatsApp replies

A provider accepting an API request is not delivery. The timeline keeps manual attempts that are sending, accepted, delivered, read, failed or unconfirmed. A failed attempt does not answer a customer's message or remove it from Needs reply.

## Reply windows and templates

A normal WhatsApp reply requires an inbound message from the customer to the same sending number within the last 24 hours. Provider time determines that window; importing historical messages does not reopen it. The server checks the window for text and files, including legacy send routes. An approved template can re-engage the customer outside that window, but normal replies remain blocked until the customer responds.

The desktop and mobile composers show the window and load approved templates from the selected account. This composer supports text-body templates with numbered variables. Templates requiring a header, buttons, carousel or named variables remain unavailable here until an appropriate editor exists. Review the rendered text, language and category before sending. No template or campaign is automatically launched by opening this panel.

## Attempts and receipts

Manual attempts are saved before provider I/O. A unique request claim prevents parallel tabs from sending the same request twice. Client retries retain their request identity when the result is uncertain. Definitive failures allow a new attempt after an explicit send action. Successful sends clear their identity so a later, intentional identical message can be sent.

Interrupted manual sends become unconfirmed during recovery; they are never requeued as automation. An existing or explicitly selected sender cannot silently fall back to a different number. File batches retain each file's attempt and stop at the first failure; retrying the same batch reuses its claims.

Meta receipts are persisted before returning HTTP 200. Storage failures return 503 so Meta can retry. Receipts match the exact message ID and sending account. Early unmatched receipts are replayed by startup/periodic reconciliation. Delivery/read evidence cannot be downgraded by a late sent or failed receipt. Historical failures without a saved reason remain clearly marked; the app does not invent a provider diagnosis.

## Everyday phone workflow

Needs reply, All, Waiting and Done describe inbox work independently of the sales pipeline. Personal unread totals cover the full inbox matching channel, search and assignment filters, before queue selection and pagination. The shared MCP identity has no personal unread state. Self-assignment and Assigned to me use local integer user identities; Clerk identities have no mapping to those records, so the UI hides those controls and the API returns an explicit assignment-unavailable response. No numeric ID is guessed from a Clerk account.

Reading a conversation changes the signed-in person's unread state; Done resolves inbox work without closing the lead. A new customer reply reopens the conversation. Notifications link directly to the mobile conversation.

The inbox uses live events, periodic query refresh and resume/reconnect refresh. There is no routine Refresh button in the mobile workspace. Connection errors remain visible with recovery controls. Installed mobile mode keeps the layout scale fixed; normal Safari pages retain browser zoom. Safe areas and the visual viewport protect the status bar, home indicator and keyboard.

See [device notification setup](notifications/web-push.md). Server-side and simulated-browser tests do not prove physical iPhone push display, keyboard behavior or gesture handling; these need a Home Screen acceptance check on the device.

## Verification

Unit and isolated API tests cover provider/import timestamps, per-number windows, template validation, failure visibility, concurrent request claims, uncertain sends, crash recovery, exact account matching, early/duplicate/out-of-order receipts and provider retry responses. The demo includes an expired conversation with a failed attempt, approved-template preview and a recent open conversation. No real customer messages are sent by these tests.
