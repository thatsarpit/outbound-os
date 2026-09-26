import prisma from '../utils/prismaClient.js';
import { requireTenantId } from './tenantContext.js';

/**
 * Tenant onboarding.
 *
 * Being a provider means the work between "they paid" and "they can send a
 * message" is ours. That work is not a function call: obtaining a WhatsApp
 * Business Account needs Meta's approval, connecting a mailbox needs the
 * customer's credentials, verifying a sending domain needs DNS records they
 * must add themselves. It takes days, stalls on the customer's side, and gets
 * abandoned halfway.
 *
 * So onboarding is modelled as durable, resumable jobs rather than a wizard.
 * Every job knows what it is waiting for and who is holding it up, because the
 * single most common support question during onboarding is "what now?".
 */

export const KIND = {
  WHATSAPP_WABA: 'whatsapp_waba',
  WHATSAPP_NUMBER: 'whatsapp_number',
  EMAIL_DOMAIN: 'email_domain',
  MAILBOX: 'mailbox',
};

export const STATUS = {
  PENDING: 'pending',
  AWAITING_CUSTOMER: 'awaiting_customer',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Legal transitions.
 *
 * Enforced rather than trusted: without this, a retry can silently move a
 * completed job back to pending and re-run provisioning that already
 * succeeded — which for a WhatsApp number means a second registration attempt
 * against Meta.
 */
const TRANSITIONS = {
  [STATUS.PENDING]: [STATUS.IN_PROGRESS, STATUS.AWAITING_CUSTOMER, STATUS.BLOCKED, STATUS.FAILED],
  [STATUS.AWAITING_CUSTOMER]: [STATUS.IN_PROGRESS, STATUS.BLOCKED, STATUS.FAILED, STATUS.COMPLETED],
  [STATUS.IN_PROGRESS]: [STATUS.AWAITING_CUSTOMER, STATUS.COMPLETED, STATUS.BLOCKED, STATUS.FAILED],
  [STATUS.BLOCKED]: [STATUS.IN_PROGRESS, STATUS.AWAITING_CUSTOMER, STATUS.FAILED],
  // Terminal. A failed job is retried by creating a new one, so the history of
  // what went wrong survives.
  [STATUS.COMPLETED]: [],
  [STATUS.FAILED]: [],
};

/** Statuses that mean nobody is working on this until something external changes. */
const STALLED = new Set([STATUS.AWAITING_CUSTOMER, STATUS.BLOCKED]);

/**
 * The default onboarding sequence, in the order a human would do it.
 * `dependsOn` is advisory — it drives what the UI presents next, not a hard
 * lock, because support sometimes needs to work a later step first.
 */
export const ONBOARDING_PLAN = [
  {
    kind: KIND.WHATSAPP_WABA,
    label: 'WhatsApp Business Account',
    nextAction: 'Connect your Meta Business account and accept the permissions prompt.',
    dependsOn: null,
  },
  {
    kind: KIND.WHATSAPP_NUMBER,
    label: 'WhatsApp sender number',
    nextAction: 'Provide a phone number that is not already registered on WhatsApp.',
    dependsOn: KIND.WHATSAPP_WABA,
  },
  {
    kind: KIND.EMAIL_DOMAIN,
    label: 'Sending domain',
    nextAction: 'Add the SPF, DKIM and DMARC records we generate to your DNS.',
    dependsOn: null,
  },
  {
    kind: KIND.MAILBOX,
    label: 'Mailbox connection',
    nextAction: 'Connect the mailbox replies should arrive in.',
    dependsOn: KIND.EMAIL_DOMAIN,
  },
];

export class TransitionError extends Error {
  constructor(from, to) {
    super(`Illegal provisioning transition: ${from} → ${to}`);
    this.name = 'TransitionError';
    this.statusCode = 409;
  }
}

/** Pure: may a job move from `from` to `to`? Separated so it tests without a DB. */
export function canTransition(from, to) {
  if (from === to) return true; // idempotent re-report of the same state
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Pure: reduce a set of jobs to a progress summary. */
export function summarise(jobs) {
  const total = jobs.length;
  const completed = jobs.filter((j) => j.status === STATUS.COMPLETED).length;
  const failed = jobs.filter((j) => j.status === STATUS.FAILED).length;
  const stalled = jobs.filter((j) => STALLED.has(j.status));
  return {
    total,
    completed,
    failed,
    // A tenant is ready when everything finished cleanly.
    ready: total > 0 && completed === total,
    // What to show the customer: the oldest thing waiting on them.
    waitingOn: stalled.length ? stalled[0] : null,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Create the onboarding jobs for a tenant. Idempotent — existing kinds are left alone. */
export async function startOnboarding(tenantId = requireTenantId(), plan = ONBOARDING_PLAN) {
  const existing = await prisma.provisioningJob.findMany({
    where: { tenantId },
    select: { kind: true },
  });
  const have = new Set(existing.map((j) => j.kind));

  const toCreate = plan
    .filter((step) => !have.has(step.kind))
    .map((step) => ({
      tenantId,
      kind: step.kind,
      status: STATUS.PENDING,
      nextAction: step.nextAction,
    }));

  if (toCreate.length) await prisma.provisioningJob.createMany({ data: toCreate });
  return prisma.provisioningJob.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
}

/** Move a job to a new status, refusing illegal transitions. */
export async function advance(jobId, status, patch = {}) {
  const job = await prisma.provisioningJob.findFirst({ where: { id: jobId } });
  if (!job) throw new Error(`No provisioning job ${jobId}`);
  if (!canTransition(job.status, status)) throw new TransitionError(job.status, status);

  const data = { status, ...patch };
  if (status === STATUS.IN_PROGRESS && !job.startedAt) data.startedAt = new Date();
  if (status === STATUS.COMPLETED) {
    data.completedAt = new Date();
    data.nextAction = null;
    data.lastError = null;
  }
  if (status === STATUS.FAILED && !patch.lastError) {
    data.lastError = 'Failed without a recorded reason';
  }

  return prisma.provisioningJob.update({ where: { id: jobId }, data });
}

/** Current onboarding state for a tenant. */
export async function getOnboardingState(tenantId = requireTenantId()) {
  const jobs = await prisma.provisioningJob.findMany({
    where: { tenantId },
    orderBy: { id: 'asc' },
  });
  return { jobs, ...summarise(jobs) };
}
