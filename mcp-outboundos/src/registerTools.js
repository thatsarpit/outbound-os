import { registerLeadTools } from './tools/leads.js';
import { registerMessageTools } from './tools/messages.js';
import { registerCampaignTools } from './tools/campaigns.js';
import { registerSystemTools } from './tools/system.js';
import { registerAnalyticsTools } from './tools/analytics.js';

/**
 * Register all MCP tools on the given McpServer instance.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerAllTools(server) {
  registerLeadTools(server);       // 12 tools
  registerMessageTools(server);    //  4 tools
  registerCampaignTools(server);   //  9 tools
  registerSystemTools(server);     //  5 tools
  registerAnalyticsTools(server);  //  4 tools
}
