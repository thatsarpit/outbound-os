import { registerLeadTools } from './tools/leads.js';
import { registerMessageTools } from './tools/messages.js';
import { registerCampaignTools } from './tools/campaigns.js';
import { registerSystemTools } from './tools/system.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerTriageTools } from './tools/triage.js';

/**
 * Register all MCP tools on the given McpServer instance.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerAllTools(server) {
  registerLeadTools(server);
  registerMessageTools(server);
  registerCampaignTools(server);
  registerSystemTools(server);
  registerAnalyticsTools(server);
  registerTriageTools(server);
}
