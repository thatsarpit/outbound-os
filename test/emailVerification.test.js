import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEmailAddress, recipientAddresses } from '../src/utils/emailVerification.js';

test('email checks separate invalid addresses, disposable mail and DNS uncertainty', async () => {
  let calls = 0;
  const mx = async () => { calls++; return [{ exchange: 'mx.example.test' }]; };
  assert.equal((await checkEmailAddress('not an email', mx)).reason, 'invalid_syntax');
  assert.equal((await checkEmailAddress('owner@mailinator.com', mx)).reason, 'disposable_domain');
  assert.equal((await checkEmailAddress('owner@sub.mailinator.com', mx)).canSend, false);
  assert.equal(calls, 0, 'proven invalid addresses require no DNS lookup');
  const ready = await checkEmailAddress(' Sales@Example.test ', mx);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.roleAccount, true);
  assert.equal(ready.mailboxVerified, false, 'MX is not mailbox verification');
  assert.equal((await checkEmailAddress('owner@example.test', async () => [{ exchange: '.', priority: 0 }])).reason, 'null_mx');
  assert.equal((await checkEmailAddress('owner@example.test', async () => [])).status, 'unknown');
  for (const [code, expected] of [['ENOTFOUND', 'invalid'], ['ENODATA', 'unknown'], ['ETIMEOUT', 'unknown']]) {
    const result = await checkEmailAddress('owner@example.test', async () => { throw Object.assign(new Error('fixture'), { code }); });
    assert.equal(result.status, expected);
    assert.equal(result.canSend, false);
  }
});

test('verification includes display-name and group recipients in To, CC and BCC', () => {
  assert.deepEqual(recipientAddresses(['Taylor <taylor@example.test>', 'Team: a@example.test, b@example.test;', 'hidden@example.test']),
    ['taylor@example.test', 'a@example.test', 'b@example.test', 'hidden@example.test']);
});

test('MCP read scope cannot start a verification job or use the status tool for writes', async () => {
  const { mcpOperationAllowed, mcpToolAllowed } = await import('../shared/mcpOperations.js');
  assert.equal(mcpToolAllowed('verify_email_addresses', 'mcp:read'), false);
  assert.equal(mcpOperationAllowed('verify_email_addresses', 'POST', '/api/email/verification/jobs', 'mcp:read mcp:write'), true);
  assert.equal(mcpOperationAllowed('email_verification_status', 'POST', '/api/email/verification/jobs', 'mcp:read'), false);
  assert.equal(mcpOperationAllowed('email_verification_status', 'GET', '/api/email/verification/jobs', 'mcp:read'), true);
});
