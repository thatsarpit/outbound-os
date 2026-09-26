/**
 * Onboarding state machine.
 *
 * The transitions matter more than they look. Provisioning talks to Meta and
 * to DNS; re-running a completed step is not a no-op, it is a second
 * registration attempt against someone else's system.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  summarise,
  STATUS,
  KIND,
  ONBOARDING_PLAN,
  TransitionError,
} from '../src/platform/provisioning.js';

describe('transitions', () => {
  test('pending can start', () => {
    assert.equal(canTransition(STATUS.PENDING, STATUS.IN_PROGRESS), true);
  });

  test('a completed job cannot be reopened', () => {
    // The one that matters: a retry must not re-register a WhatsApp number.
    assert.equal(canTransition(STATUS.COMPLETED, STATUS.PENDING), false);
    assert.equal(canTransition(STATUS.COMPLETED, STATUS.IN_PROGRESS), false);
  });

  test('a failed job is terminal — retry means a new job', () => {
    // Keeps the record of what went wrong instead of overwriting it.
    assert.equal(canTransition(STATUS.FAILED, STATUS.IN_PROGRESS), false);
  });

  test('re-reporting the same status is allowed', () => {
    // Webhooks redeliver; an idempotent re-report must not 409.
    assert.equal(canTransition(STATUS.IN_PROGRESS, STATUS.IN_PROGRESS), true);
    assert.equal(canTransition(STATUS.COMPLETED, STATUS.COMPLETED), true);
  });

  test('a blocked job can resume or fail but not complete directly', () => {
    assert.equal(canTransition(STATUS.BLOCKED, STATUS.IN_PROGRESS), true);
    assert.equal(canTransition(STATUS.BLOCKED, STATUS.COMPLETED), false);
  });

  test('awaiting_customer can complete — the customer finished the step', () => {
    assert.equal(canTransition(STATUS.AWAITING_CUSTOMER, STATUS.COMPLETED), true);
  });

  test('TransitionError carries 409', () => {
    const e = new TransitionError(STATUS.COMPLETED, STATUS.PENDING);
    assert.equal(e.statusCode, 409);
  });
});

describe('summarise', () => {
  const job = (status, kind = KIND.MAILBOX) => ({ status, kind });

  test('no jobs is not ready', () => {
    // Guards against 0/0 reading as "100% complete".
    const s = summarise([]);
    assert.equal(s.ready, false);
    assert.equal(s.percent, 0);
  });

  test('all completed is ready', () => {
    const s = summarise([job(STATUS.COMPLETED), job(STATUS.COMPLETED)]);
    assert.equal(s.ready, true);
    assert.equal(s.percent, 100);
  });

  test('one outstanding job is not ready', () => {
    const s = summarise([job(STATUS.COMPLETED), job(STATUS.PENDING)]);
    assert.equal(s.ready, false);
    assert.equal(s.percent, 50);
  });

  test('a failed job blocks readiness even if others completed', () => {
    const s = summarise([job(STATUS.COMPLETED), job(STATUS.FAILED)]);
    assert.equal(s.ready, false);
    assert.equal(s.failed, 1);
  });

  test('surfaces what the customer is holding up', () => {
    const s = summarise([
      job(STATUS.COMPLETED),
      job(STATUS.AWAITING_CUSTOMER, KIND.WHATSAPP_NUMBER),
    ]);
    assert.equal(s.waitingOn.kind, KIND.WHATSAPP_NUMBER);
  });

  test('nothing stalled means nothing to chase', () => {
    const s = summarise([job(STATUS.IN_PROGRESS)]);
    assert.equal(s.waitingOn, null);
  });
});

describe('onboarding plan', () => {
  test('every step has an action written for a human', () => {
    for (const step of ONBOARDING_PLAN) {
      assert.ok(step.nextAction && step.nextAction.length > 10, `${step.kind} needs a nextAction`);
      assert.ok(step.label, `${step.kind} needs a label`);
    }
  });

  test('dependencies reference steps that exist', () => {
    const kinds = new Set(ONBOARDING_PLAN.map((s) => s.kind));
    for (const step of ONBOARDING_PLAN) {
      if (step.dependsOn) assert.ok(kinds.has(step.dependsOn), `${step.kind} depends on a missing step`);
    }
  });
});
