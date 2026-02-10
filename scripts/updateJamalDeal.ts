import { createSalesMcpServer } from '../src/tools/mcp.ts';

const server = createSalesMcpServer();
const tool = server.instance._registeredTools['crm_updateDealProperties'];

if (!tool) {
  console.error('Tool not found');
  process.exit(1);
}

const input = {
  dealId: '231680955886',
  agents_required: 8,
  sw_primary_pain: 'Using basic shared inbox - slow response times, tickets slipping through cracks, no visibility into what is being handled, duplicate responses as team scales'
};

const result = await tool.handler(input);
console.log(JSON.stringify(result, null, 2));
