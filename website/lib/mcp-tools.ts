/** The tools the MCP server in mcp-outboundos/src/tools exposes, by group.
    Keep in step with that folder; the home page and /mcp both count these. */
export const mcpToolGroups = [
  { name: 'Leads', tools: ['list_leads', 'get_lead', 'create_lead', 'update_lead', 'delete_lead', 'import_leads', 'list_tags', 'lead_timeline', 'lead_assign', 'lead_set_status', 'lead_toggle_pause', 'bulk_lead_action'] },
  { name: 'Campaigns', tools: ['list_campaigns', 'get_campaign', 'create_campaign', 'update_campaign', 'delete_campaign', 'start_campaign', 'pause_campaign', 'campaign_preview_leads', 'campaign_ab_results'] },
  { name: 'Messages', tools: ['list_messages', 'send_whatsapp', 'send_email'] },
  { name: 'Analytics', tools: ['stats_overview', 'analytics_funnel', 'analytics_campaign_roi', 'analytics_email_performance'] },
  { name: 'System', tools: ['system_status', 'system_pause_resume', 'whatsapp_accounts', 'list_users'] },
] as const

export const mcpToolCount = mcpToolGroups.reduce((sum, group) => sum + group.tools.length, 0)
