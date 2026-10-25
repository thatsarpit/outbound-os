import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerAllTools } from '../src/registerTools.js';

test('upgraded schemas preserve arbitrary JSON campaign filters and bulk payloads through tool handlers', async (t) => {
  const tools = new Map();
  registerAllTools({
    tool(name, _description, schema, ...rest) {
      tools.set(name, { schema: z.object(schema), handler: rest.at(-1) });
    },
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
    return Response.json({ id: 7, name: 'Fixture campaign', status: 'draft' });
  });
  const value = { status: 'new', minScore: 20, tags: ['fixture', 'retail'], nested: { enabled: true, absent: null } };
  for (const [name, args, path, key] of [
    ['create_campaign', { name: 'Fixture campaign', messageTemplate: 'Hello {{name}}', targetFilter: value }, '/api/campaigns', 'targetFilter'],
    ['update_campaign', { campaign_id: 7, targetFilter: value }, '/api/campaigns/7', 'targetFilter'],
    ['campaign_preview_leads', { filter: value }, '/api/campaigns/preview-leads', 'filter'],
    ['bulk_lead_action', { ids: [7], action: 'status', payload: value }, '/api/leads/bulk', 'payload'],
  ]) {
    const tool = tools.get(name);
    const result = await tool.handler(tool.schema.parse(args));
    assert.notEqual(result.isError, true, name);
    assert.equal(calls.at(-1).path, path, name);
    assert.deepEqual(calls.at(-1).body[key], value, name);
  }
  assert.equal(calls.length, 4, 'only mocked backend requests occur');
});

test('bounded collections reject oversized invalid input before allocating per-element issues', () => {
  let parsed = 0;
  const schema = z.array(z.string().refine(() => { parsed++; return true; })).max(2);
  const result = schema.safeParse(Array(10_000).fill(0));
  assert.equal(result.success, false);
  assert.equal(parsed, 0);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});
