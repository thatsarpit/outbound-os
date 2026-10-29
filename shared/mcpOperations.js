/** One operation policy shared by the OAuth resource server and the API. */
export const MCP_READ_OPERATIONS = Object.freeze({
  stats_overview: /^\/api\/stats\/overview$/,
  whatsapp_costs: /^\/api\/analytics\/whatsapp-pricing$/,
  analytics_funnel: /^\/api\/analytics\/funnel$/,
  analytics_campaign_roi: /^\/api\/analytics\/campaign-roi$/,
  analytics_email_performance: /^\/api\/analytics\/email-performance$/,
  list_campaigns: /^\/api\/campaigns$/,
  get_campaign: /^\/api\/campaigns\/[1-9]\d*$/,
  campaign_ab_results: /^\/api\/campaigns\/[1-9]\d*\/ab-results$/,
  campaign_leads: /^\/api\/campaigns\/[1-9]\d*\/leads$/,
  list_tags: /^\/api\/leads\/tags$/,
  list_leads: /^\/api\/leads$/,
  get_lead: /^\/api\/leads\/[1-9]\d*$/,
  lead_timeline: /^\/api\/leads\/[1-9]\d*\/timeline$/,
  list_messages: /^\/api\/leads\/[1-9]\d*\/messages$/,
  list_media_files: /^\/api\/media$/,
  system_status: /^\/api\/system\/status$/,
  whatsapp_accounts: /^\/api\/whatsapp\/accounts$/,
  whatsapp_templates: /^\/api\/whatsapp\/accounts\/[1-9]\d*\/templates$/,
  email_accounts: /^\/api\/email\/accounts$/,
  email_verification_status: /^\/api\/email\/verification\/jobs(?:\/[0-9a-f-]{36})?$/,
  list_users: /^\/api\/(?:users|workspace\/members)$/,
  campaign_preview_leads: /^\/api\/campaigns\/preview-leads$/,
});

export const MCP_WRITE_OPERATIONS = Object.freeze({
  create_lead: ['POST', /^\/api\/leads$/],
  update_lead: ['PATCH', /^\/api\/leads\/[1-9]\d*$/],
  delete_lead: ['DELETE', /^\/api\/leads\/[1-9]\d*$/],
  import_leads: ['POST', /^\/api\/leads\/import-json$/],
  lead_toggle_pause: ['POST', /^\/api\/leads\/[1-9]\d*\/pause$/],
  lead_set_status: ['POST', /^\/api\/leads\/[1-9]\d*\/status$/],
  lead_assign: ['POST', /^\/api\/leads\/[1-9]\d*\/assign$/],
  bulk_lead_action: ['POST', /^\/api\/leads\/bulk$/],
  create_campaign: ['POST', /^\/api\/campaigns$/],
  update_campaign: ['PATCH', /^\/api\/campaigns\/[1-9]\d*$/],
  delete_campaign: ['DELETE', /^\/api\/campaigns\/[1-9]\d*$/],
  populate_campaign: ['POST', /^\/api\/campaigns\/[1-9]\d*\/populate$/],
  start_campaign: ['POST', /^\/api\/campaigns\/[1-9]\d*\/start$/],
  pause_campaign: ['POST', /^\/api\/campaigns\/[1-9]\d*\/pause$/],
  send_whatsapp: ['POST', /^\/api\/leads\/[1-9]\d*\/send$/],
  send_whatsapp_file: ['POST', /^\/api\/leads\/[1-9]\d*\/send-media$/],
  send_email: ['POST', /^\/api\/leads\/[1-9]\d*\/email\/send$/],
  verify_email_addresses: ['POST', /^\/api\/email\/verification\/jobs$/],
  system_pause_resume: ['POST', /^\/api\/system\/(?:pause|resume)$/],
});

export const MCP_SCOPES = Object.freeze(['mcp:read', 'mcp:write']);
export const MCP_FULL_SCOPE = MCP_SCOPES.join(' ');
export function validMcpScope(scope) {
  return typeof scope === 'string' && scope.length > 0
    && scope.split(' ').every(item => MCP_SCOPES.includes(item))
    && new Set(scope.split(' ')).size === scope.split(' ').length;
}
export const hasMcpWrite = scope => validMcpScope(scope) && scope.split(' ').includes('mcp:write');
export function mcpReadOperationAllowed(tool, method, pathname) {
  return method === (tool === 'campaign_preview_leads' ? 'POST' : 'GET') && typeof pathname === 'string'
    && Object.hasOwn(MCP_READ_OPERATIONS, tool) && MCP_READ_OPERATIONS[tool].test(pathname);
}
export function mcpToolAllowed(tool, scope) {
  return validMcpScope(scope) && (Object.hasOwn(MCP_READ_OPERATIONS, tool)
    || (hasMcpWrite(scope) && Object.hasOwn(MCP_WRITE_OPERATIONS, tool)));
}
export function mcpOperationAllowed(tool, method, pathname, scope) {
  if (!validMcpScope(scope)) return false;
  if (mcpReadOperationAllowed(tool, method, pathname)) return true;
  const operation = Object.hasOwn(MCP_WRITE_OPERATIONS, tool) && MCP_WRITE_OPERATIONS[tool];
  return hasMcpWrite(scope) && !!operation && method === operation[0]
    && typeof pathname === 'string' && operation[1].test(pathname);
}
