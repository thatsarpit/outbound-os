import { z } from 'zod';
import { get, post, patch, del } from '../client.js';
import { LeadId, Page, Limit, VALID_LEAD_STATUSES, VALID_BULK_ACTIONS, ok, err } from '../schemas/common.js';

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function registerLeadTools(server) {

  // ── import_leads ──
  server.tool(
    'import_leads',
    'Bulk-import leads with de-duplication and tagging. Existing leads (matched on '
      + 'normalised mobile) are left in place and only have blank fields filled in. '
      + 'Does NOT send any outreach — use a campaign for that.',
    {
      leads: z.array(z.object({
        mobile:      z.string().describe('Required. Any format; normalised on the server.'),
        name:        z.string().optional(),
        company:     z.string().optional(),
        email:       z.string().optional(),
        product:     z.string().optional(),
        country:     z.string().optional(),
        quantity:    z.string().optional(),
        externalId:  z.string().optional().describe("The lead's id in the system it came from"),
        consumedAt:  z.string().optional().describe('ISO date the lead was acquired'),
      })).min(1).max(20000),
      tags:  z.array(z.string()).optional()
               .describe('Applied to every imported lead. Check list_tags first so the spelling matches.'),
      label: z.string().optional().describe('Shows up in the import history'),
    },
    async ({ leads, tags, label }) => {
      try {
        const { data } = await post('/api/leads/import-json', { leads, tags, label });
        if (!data?.success) return err(data?.error || 'Import failed');
        return ok({
          batchId: data.batchId,
          totalRows: data.totalRows,
          imported: data.imported,
          duplicates: data.duplicates,
          failed: data.failed,
          note: 'imported = brand new leads. duplicates = already in the CRM.',
        });
      } catch (e) { return err(e.message); }
    },
  );

  // ── list_tags ──
  server.tool(
    'list_tags',
    'Every tag in use, with how many leads carry it. Tags are how leads are '
      + 'segmented, so read this before tagging or importing to match existing spelling.',
    {},
    async () => {
      try {
        const { data } = await get('/api/leads/tags');
        return ok({ total: data.tags?.length ?? 0, tags: data.tags });
      } catch (e) { return err(e.message); }
    },
  );

  // ── list_leads ──
  server.tool(
    'list_leads',
    'List and filter leads with pagination, search, scoring, and date filters',
    {
      status:       z.string().optional().describe('Filter by status (new, contacted, replied, engaged, closed, paused, wa_unavailable)'),
      search:       z.string().optional().describe('Search name, company, mobile, email'),
      page:         Page.optional(),
      limit:        Limit.optional(),
      sortBy:       z.string().optional().describe('Sort field (createdAt, score, name, status, lastMessageAt)'),
      sortOrder:    z.enum(['asc', 'desc']).optional(),
      minScore:     z.number().optional().describe('Min lead score'),
      maxScore:     z.number().optional().describe('Max lead score'),
      source:       z.string().optional().describe('Lead source filter, e.g. csv_import, manual, or a webhook source slug'),
      tags:         z.string().optional().describe('Comma-separated tags to filter by'),
      engagement:   z.string().optional().describe('Engagement level: none, low, medium, high'),
      dateFrom:     z.string().optional().describe('ISO date — leads created after'),
      dateTo:       z.string().optional().describe('ISO date — leads created before'),
      assignedToId: z.number().int().optional().describe('Filter by assigned user ID'),
    },
    async (params) => {
      try {
        const { data } = await get('/api/leads', params);
        return ok({
          total: data.total,
          page: data.page,
          pages: data.pages,
          leads: data.leads?.map(l => ({
            id: l.id, name: l.name, company: l.company, mobile: l.mobile,
            email: l.email, status: l.status, score: l.score, leadTier: l.leadTier,
            source: l.source, tags: l.tags, country: l.country,
            createdAt: l.createdAt, lastMessageAt: l.lastMessageAt,
          })),
        });
      } catch (e) { return err(e.message); }
    },
  );

  // ── get_lead ──
  server.tool(
    'get_lead',
    'Get full details for a single lead including recent messages, campaign memberships, and notes',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await get(`/api/leads/${lead_id}`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── create_lead ──
  server.tool(
    'create_lead',
    'Create a new lead. Requires name and mobile number (Indian numbers auto-prefixed with 91).',
    {
      name:     z.string().describe('Contact name'),
      mobile:   z.string().describe('Mobile number (digits only, 91 prefix added if missing)'),
      company:  z.string().optional(),
      email:    z.string().email().optional(),
      product:  z.string().optional(),
      country:  z.string().optional(),
      quantity: z.string().optional(),
      tags:     z.string().optional().describe('Comma-separated tags'),
      notes:    z.string().optional(),
    },
    async (params) => {
      try {
        const { data } = await post('/api/leads', params);
        return ok({ created: true, id: data.id, name: data.name, mobile: data.mobile });
      } catch (e) { return err(e.message); }
    },
  );

  // ── update_lead ──
  server.tool(
    'update_lead',
    'Update fields on an existing lead',
    {
      lead_id:         LeadId,
      name:            z.string().optional(),
      company:         z.string().optional(),
      email:           z.string().optional(),
      product:         z.string().optional(),
      country:         z.string().optional(),
      quantity:        z.string().optional(),
      status:          z.enum(VALID_LEAD_STATUSES).optional(),
      tags:            z.string().optional(),
      notes:           z.string().optional(),
      maxFollowups:    z.number().int().optional(),
      assignedAccount: z.number().int().optional(),
    },
    async ({ lead_id, ...body }) => {
      try {
        const { data } = await patch(`/api/leads/${lead_id}`, body);
        return ok({ updated: true, id: data.id, status: data.status });
      } catch (e) { return err(e.message); }
    },
  );

  // ── delete_lead ──
  server.tool(
    'delete_lead',
    'Permanently delete a lead and all associated messages, notes, and tasks. THIS IS IRREVERSIBLE.',
    { lead_id: LeadId },
    {
      destructiveHint: true,
      title: 'Delete Lead',
    },
    async ({ lead_id }) => {
      try {
        const { data } = await del(`/api/leads/${lead_id}`);
        return ok({ deleted: true, id: data.deleted });
      } catch (e) { return err(e.message); }
    },
  );

  // ── lead_toggle_pause ──
  server.tool(
    'lead_toggle_pause',
    'Toggle a lead between paused and active (new) status',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/pause`);
        return ok({ id: data.id, status: data.status });
      } catch (e) { return err(e.message); }
    },
  );

  // ── lead_set_status ──
  server.tool(
    'lead_set_status',
    'Set the status of a lead to a specific value',
    {
      lead_id: LeadId,
      status:  z.enum(VALID_LEAD_STATUSES).describe('Target status'),
    },
    async ({ lead_id, status }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/status`, { status });
        return ok({ id: data.id, status: data.status });
      } catch (e) { return err(e.message); }
    },
  );

  // ── lead_timeline ──
  server.tool(
    'lead_timeline',
    'Get the full activity timeline for a lead — messages, notes, tasks, creation event — sorted by time',
    { lead_id: LeadId },
    async ({ lead_id }) => {
      try {
        const { data } = await get(`/api/leads/${lead_id}/timeline`);
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── lead_assign ──
  server.tool(
    'lead_assign',
    'Assign a lead to a team member (by user ID) or unassign by passing null',
    {
      lead_id: LeadId,
      user_id: z.number().int().nullable().describe('User ID to assign, or null to unassign'),
    },
    async ({ lead_id, user_id }) => {
      try {
        const { data } = await post(`/api/leads/${lead_id}/assign`, { userId: user_id });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );

  // ── bulk_lead_action ──
  server.tool(
    'bulk_lead_action',
    'Perform a bulk action on multiple leads: tag, untag, status, pause, resume, assign_wa, assign_email, delete, export',
    {
      ids:     z.array(z.number().int().positive()).min(1).describe('Array of lead IDs'),
      action:  z.enum(VALID_BULK_ACTIONS).describe('Action to perform'),
      payload: z.record(z.any()).optional().describe('Action-specific payload (e.g. {tag:"vip"}, {status:"closed"}, {accountId:1})'),
    },
    {
      destructiveHint: true,
      title: 'Bulk Lead Action',
    },
    async ({ ids, action, payload }) => {
      try {
        const { data } = await post('/api/leads/bulk', { ids, action, payload });
        return ok(data);
      } catch (e) { return err(e.message); }
    },
  );
}
