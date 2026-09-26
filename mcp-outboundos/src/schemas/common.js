import { z } from 'zod';

// ── Re-usable schema fragments ──

export const LeadId = z.number().int().positive().describe('Lead ID');
export const CampaignId = z.number().int().positive().describe('Campaign ID');
export const Page = z.number().int().min(1).default(1).describe('Page number (default 1)');
export const Limit = z.number().int().min(1).max(100).default(25).describe('Results per page (max 100)');

export const VALID_LEAD_STATUSES = [
  'new', 'contacted', 'replied', 'engaged', 'closed', 'paused', 'wa_unavailable',
];

export const VALID_BULK_ACTIONS = [
  'tag', 'untag', 'status', 'pause', 'resume', 'assign_wa', 'assign_email', 'delete', 'export',
];

export const VALID_CHANNELS = ['whatsapp', 'email', 'both'];

export const RangeParam = z.enum(['7d', '30d', '90d', 'all']).default('30d').describe('Time range');

/**
 * Format a tool result for the MCP SDK.
 * Always returns { content: [{ type: "text", text: string }] }.
 */
export function ok(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

export function err(message) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
