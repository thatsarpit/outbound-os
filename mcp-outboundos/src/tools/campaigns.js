import { z } from 'zod';
import { get, post, patch, del } from '../client.js';
import { CampaignId, Page, Limit, VALID_CHANNELS, ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerCampaignTools(server) {

  // ── list_campaigns ──
  server.tool(
    'list_campaigns',
    'List campaigns with optional status and search filters',
    {
      status: z.string().optional().describe('Filter by campaign status (draft, running, paused, completed)'),
      search: z.string().optional().describe('Search campaign name'),
      page:   Page.optional(),
      limit:  Limit.optional(),
    },
    async (params) => {
      try {
        const { data } = await get('/api/campaigns', params);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── get_campaign ──
  server.tool(
    'get_campaign',
    'Get full details of a campaign including lead counts and progress',
    { campaign_id: CampaignId },
    async ({ campaign_id }) => {
      try {
        const { data } = await get(`/api/campaigns/${campaign_id}`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── create_campaign ──
  server.tool(
    'create_campaign',
    'Create a new outreach campaign. Starts in draft status. Use start_campaign to begin sending.',
    {
      name:              z.string().max(200).describe('Campaign name'),
      messageTemplate:   z.string().describe('Message template with {{name}}, {{product}} etc. placeholders'),
      description:       z.string().optional(),
      channel:           z.enum(VALID_CHANNELS).optional().describe('Channel: whatsapp (default), email, or both'),
      emailSubject:      z.string().optional().describe('Required for email/both campaigns'),
      targetFilter:      z.record(z.any()).optional().describe('Lead filter criteria — e.g. {status:"new", tags:"trade_show_2026"}'),
      senderAccountId:   z.number().int().optional().describe('Email sender account ID'),
      waCampaignName:    z.string().optional().describe(
        'Approved WhatsApp template: its template name on Meta, or its API campaign name on '
        + 'AiSensy (whichever the sending number uses). Set this for any WhatsApp audience '
        + 'that is not inside an open 24h conversation — cold or re-engagement leads — '
        + 'because WhatsApp rejects free text there. Template params sent are '
        + '[first name, country].'),
      variantBTemplate:  z.string().optional().describe('A/B test: variant B message template'),
      variantBSubject:   z.string().optional().describe('A/B test: variant B email subject'),
    },
    async (params) => {
      try {
        const { data } = await post('/api/campaigns', params);
        return ok({ created: true, id: data.id, name: data.name, status: data.status });
      } catch (e) { return err(e.message); }
    },
  );

  // ── update_campaign ──
  server.tool(
    'update_campaign',
    'Update a draft campaign. Only draft campaigns can be edited.',
    {
      campaign_id:       CampaignId,
      name:              z.string().max(200).optional(),
      description:       z.string().optional(),
      messageTemplate:   z.string().optional(),
      emailSubject:      z.string().optional(),
      channel:           z.enum(VALID_CHANNELS).optional(),
      targetFilter:      z.record(z.any()).optional(),
      senderAccountId:   z.number().int().optional(),
      variantBTemplate:  z.string().optional(),
      variantBSubject:   z.string().optional(),
    },
    async ({ campaign_id, ...body }) => {
      try {
        const { data } = await patch(`/api/campaigns/${campaign_id}`, body);
        return ok({ updated: true, id: data.id });
      } catch (e) { return err(e.message); }
    },
  );

  // ── delete_campaign ──
  server.tool(
    'delete_campaign',
    'Permanently delete a campaign. Cannot delete running campaigns — pause first. THIS IS IRREVERSIBLE.',
    { campaign_id: CampaignId },
    {
      destructiveHint: true,
      title: 'Delete Campaign',
    },
    async ({ campaign_id }) => {
      try {
        const { data } = await del(`/api/campaigns/${campaign_id}`);
        return ok({ deleted: true, id: data.deleted });
      } catch (e) { return err(e.message); }
    },
  );

  // ── start_campaign ──
  server.tool(
    'start_campaign',
    'Start a campaign — begins sending messages to matched leads',
    { campaign_id: CampaignId },
    async ({ campaign_id }) => {
      try {
        const { data } = await post(`/api/campaigns/${campaign_id}/start`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── pause_campaign ──
  server.tool(
    'pause_campaign',
    'Pause a running campaign — stops sending but preserves progress',
    { campaign_id: CampaignId },
    async ({ campaign_id }) => {
      try {
        const { data } = await post(`/api/campaigns/${campaign_id}/pause`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── campaign_ab_results ──
  server.tool(
    'campaign_ab_results',
    'Get A/B test results for a campaign — compares variant A vs B reply rates',
    { campaign_id: CampaignId },
    async ({ campaign_id }) => {
      try {
        const { data } = await get(`/api/campaigns/${campaign_id}/ab-results`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── campaign_preview_leads ──
  server.tool(
    'campaign_preview_leads',
    'Preview which leads match a campaign filter — returns count and sample of 10',
    {
      filter: z.record(z.any()).optional().describe('Lead filter criteria — e.g. {status:"new", country:"India"}'),
    },
    async ({ filter }) => {
      try {
        const { data } = await post('/api/campaigns/preview-leads', { filter });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );
}
