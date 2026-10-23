import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerSystemTools } from '../src/tools/system.js';
import { registerMessageTools } from '../src/tools/messages.js';

const tools = new Map();
registerMessageTools({
  tool(name, description, schema, handler) {
    tools.set(name, { description, schema: z.object(schema), handler });
  },
});
registerSystemTools({
  tool(name, description, schema, handler) {
    tools.set(name, { description, schema: z.object(schema), handler });
  },
});
const invoke = (name, args) =>
  tools.get(name).handler(tools.get(name).schema.parse(args));
const payload = (result) => JSON.parse(result.content[0].text);

test('message history preserves failure, delivery and account facts without leaking unlisted backend fields', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      {
        id: 1,
        channel: 'whatsapp',
        direction: 'outbound',
        content: 'Fixture attempt',
        status: 'failed',
        providerStatusReason: 're_engagement_required',
        waAccount: 7,
        waMessageId: 'wamid.FIXTURE',
        ackStatus: 0,
        billable: false,
        cloudApiToken: 'fixture-private-value',
      },
      {
        id: 2,
        direction: 'outbound',
        content: 'Uncertain fixture',
        status: 'unconfirmed',
        providerStatusReason: 'confirmation_unknown',
      },
    ]),
  );
  const result = payload(await invoke('list_messages', { lead_id: 12 }));
  assert.equal(result[0].providerStatusReason, 're_engagement_required');
  assert.equal(result[0].waAccount, 7);
  assert.equal(result[0].waMessageId, 'wamid.FIXTURE');
  assert.equal(result[0].ackStatus, 0);
  assert.equal(result[0].billable, false);
  assert.equal(result[1].status, 'unconfirmed');
  assert.equal(result[1].providerStatusReason, 'confirmation_unknown');
  assert.equal(result[1].waAccount, null);
  assert.ok(!JSON.stringify(result).includes('fixture-private-value'));
});

test('manual WhatsApp tools pass retry identities and distinguish acceptance from delivery', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({
      success: true,
      reason: 'provider_accepted',
      message: {
        id: 31,
        status: 'sent',
        providerStatusReason: 'provider_accepted',
      },
    });
  });
  const id = 'fixture-request-00001';
  const result = await invoke('send_whatsapp', {
    lead_id: 12,
    message: 'Fixture reply',
    client_message_id: id,
  });
  assert.deepEqual(bodies[0], {
    message: 'Fixture reply',
    clientMessageId: id,
  });
  assert.equal(payload(result).client_message_id, id);
  assert.equal(payload(result).status, 'sent');
  assert.equal(payload(result).providerStatusReason, 'provider_accepted');
  assert.notEqual(result.isError, true);
  assert.match(tools.get('send_whatsapp').description, /acceptance/);
  assert.throws(() =>
    tools
      .get('send_whatsapp')
      .schema.parse({
        lead_id: 12,
        message: 'Fixture',
        client_message_id: 'short',
      }),
  );
});

test('an interrupted MCP send returns its request identity without automatic retries or raw backend details', async (t) => {
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('Fixture connection interrupted');
  });
  const failed = await invoke('send_whatsapp', {
    lead_id: 12,
    message: 'Fixture reply',
  });
  assert.equal(calls, 1, 'no automatic second send');
  assert.equal(failed.isError, true);
  const first = payload(failed);
  assert.match(first.client_message_id, /^[\w-]{16,100}$/);
  assert.equal(first.reason, 'confirmation_unknown');
  mock.mock.mockImplementation(async (_url, options) => {
    calls++;
    assert.equal(
      JSON.parse(options.body).clientMessageId,
      first.client_message_id,
    );
    return Response.json(
      {
        error: 'Reply window closed',
        reason: 're_engagement_required',
        code: 'window_closed',
        privateField: 'do-not-expose',
      },
      { status: 409 },
    );
  });
  const retry = await invoke('send_whatsapp', {
    lead_id: 12,
    message: 'Fixture reply',
    client_message_id: first.client_message_id,
  });
  assert.equal(calls, 2);
  assert.equal(retry.isError, true);
  assert.equal(payload(retry).reason, 're_engagement_required');
  assert.equal(payload(retry).httpStatus, 409);
  assert.equal(payload(retry).client_message_id, first.client_message_id);
  assert.ok(!JSON.stringify(retry).includes('do-not-expose'));
});

test('file sends preserve the request identity and flag failed or uncertain attempts', async (t) => {
  const id = 'fixture-file-request-01';
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), {
      mediaFileId: 4,
      caption: 'Fixture caption',
      clientMessageId: id,
    });
    return Response.json({
      success: false,
      messages: [
        {
          id: 32,
          mediaFilename: 'fixture.pdf',
          status: 'unconfirmed',
          providerStatusReason: 'confirmation_unknown',
        },
      ],
    });
  });
  const result = await invoke('send_whatsapp_file', {
    lead_id: 12,
    media_file_id: 4,
    caption: 'Fixture caption',
    client_message_id: id,
  });
  assert.equal(result.isError, true);
  assert.equal(payload(result).client_message_id, id);
  assert.equal(
    payload(result).messages[0].providerStatusReason,
    'confirmation_unknown',
  );
});

test('account diagnostics retain the current API name, connection state and provider', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      {
        id: 7,
        name: 'Fixture sender',
        status: 'connected',
        provider: 'meta',
        enabled: true,
        isReady: true,
        dailyLimit: 50,
        messagesSentToday: 0,
        cloudApiToken: 'private-fixture',
      },
    ]),
  );
  const rows = payload(await invoke('whatsapp_accounts', {}));
  assert.equal(rows[0].label, 'Fixture sender');
  assert.equal(rows[0].status, 'connected');
  assert.equal(rows[0].provider, 'meta');
  assert.equal(rows[0].messagesSentToday, 0);
  assert.ok(!JSON.stringify(rows).includes('private-fixture'));
});

test('a rejected authenticated request is not described as an uncertain provider send', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Not signed in.' }, { status: 401 }),
  );
  const result = await invoke('send_whatsapp', {
    lead_id: 12,
    message: 'Fixture reply',
  });
  assert.equal(result.isError, true);
  assert.equal(payload(result).httpStatus, 401);
  assert.equal(payload(result).reason, 'request_rejected');
});
