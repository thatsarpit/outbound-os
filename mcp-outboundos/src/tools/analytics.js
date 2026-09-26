import { z } from 'zod';
import { get } from '../client.js';
import { RangeParam, ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerAnalyticsTools(server) {

  // ── stats_overview ──
  server.tool(
    'stats_overview',
    'Dashboard overview stats — total leads, today\'s new, contacted, replied, engaged, closed, pending messages, score distribution, polling health, LLM usage',
    {},
    async () => {
      try {
        const { data } = await get('/api/stats/overview', { tzOffset: '-330' });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── analytics_funnel ──
  server.tool(
    'analytics_funnel',
    'Conversion funnel — lead progression through stages with drop-off rates, source/tier/intent breakdowns, avg reply time',
    {
      range:   RangeParam.optional(),
      source:  z.string().optional().describe('Filter by lead source'),
      country: z.string().optional().describe('Filter by country (partial match)'),
      tier:    z.string().optional().describe('Filter by tier: HOT, WARM, COLD'),
    },
    async (params) => {
      try {
        const { data } = await get('/api/analytics/funnel', params);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── analytics_campaign_roi ──
  server.tool(
    'analytics_campaign_roi',
    'Campaign ROI analysis — per-campaign sent/replied/converted counts, reply rates, conversion rates, revenue attribution',
    {
      range: RangeParam.optional(),
    },
    async ({ range }) => {
      try {
        const { data } = await get('/api/analytics/campaign-roi', { range });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── analytics_email_performance ──
  server.tool(
    'analytics_email_performance',
    'Email template performance — per-variant sent/replied counts and reply rates',
    {
      range: RangeParam.optional(),
    },
    async ({ range }) => {
      try {
        const { data } = await get('/api/analytics/email-performance', { range });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );
}
