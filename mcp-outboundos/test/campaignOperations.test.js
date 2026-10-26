import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerAllTools } from '../src/registerTools.js';

const tools = new Map();
registerAllTools({ tool(name, _description, schema, ...rest) {
  tools.set(name, { schema: z.object(schema), handler: rest.at(-1) });
} });
const invoke = (name, args) => tools.get(name).handler(tools.get(name).schema.parse(args));

test('campaign preparation forwards explicit independent senders, Meta template and channel-aware audience operations', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), method: options.method, body: options.body && JSON.parse(options.body) });
    return Response.json({ id: 7, name: 'Synthetic campaign', status: 'draft' });
  });
  const fields = { emailSenderAccountId: 2, whatsappSenderAccountId: 3, waCampaignName: 'synthetic_approved_template', channel: 'both' };
  await invoke('create_campaign', { name: 'Synthetic campaign', messageTemplate: 'Hello {{name}}', emailSubject: 'Synthetic subject', ...fields });
  for (const [key, value] of Object.entries(fields)) assert.equal(calls.at(-1).body[key], value);
  await invoke('update_campaign', { campaign_id: 7, ...fields });
  for (const [key, value] of Object.entries(fields)) assert.equal(calls.at(-1).body[key], value);
  await invoke('campaign_preview_leads', { channel: 'email', filter: { tags: 'synthetic' } });
  assert.equal(calls.at(-1).body.channel, 'email');
  await invoke('populate_campaign', { campaign_id: 7 });
  assert.equal(calls.at(-1).url.pathname, '/api/campaigns/7/populate');
  assert.equal(calls.at(-1).method, 'POST');
  await invoke('campaign_leads', { campaign_id: 7, page: 2, limit: 10, status: 'pending' });
  assert.equal(calls.at(-1).url.pathname, '/api/campaigns/7/leads');
  assert.equal(calls.at(-1).url.searchParams.get('page'), '2');
  assert.equal(calls.at(-1).url.searchParams.get('status'), 'pending');
});

test('email sender discovery exposes readiness and persona ID without returning account credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ id: 2, email: 'sales@example.test', enabled: true,
    status: 'verified', whatsappAccountId: 3, smtpPass: 'synthetic-secret', smtpUser: 'synthetic-private', imapPass: 'synthetic-secret' }]));
  const response = await invoke('email_accounts', {});
  const accounts = JSON.parse(response.content[0].text);
  assert.equal(accounts[0].whatsappAccountId, 3);
  assert.equal(accounts[0].status, 'verified');
  assert.equal(accounts[0].enabled, true);
  assert.equal(JSON.stringify(accounts).includes('synthetic-secret'), false);
  assert.equal(JSON.stringify(accounts).includes('synthetic-private'), false);
});
