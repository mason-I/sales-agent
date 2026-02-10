import { createSalesMcpServer } from '../src/tools/mcp.ts';

const server = createSalesMcpServer();
const tool = server.instance._registeredTools['crm_logEmailDraft'];

if (!tool) {
  console.error('Tool not found');
  process.exit(1);
}

const input = {
  contactId: '282226128353',
  dealId: '231680955886',
  subject: 'Re: Quick question',
  bodyParts: {
    intro: "Thanks for explaining your situation. The challenges you described—tickets slipping through cracks, duplicate responses, no visibility—are exactly what a proper help desk solves. That shared inbox approach really limits you as you scale.",
    questions: [
      "So I can point you to the right plan, roughly how many tickets are you handling per month?"
    ],
    closing: "Regarding discounts—I appreciate you asking. Our pricing reflects the value and ongoing investment in the platform, so we don't offer promotional pricing. That said, I'm confident you'll see strong ROI once you're no longer firefighting in a shared inbox."
  }
};

const result = await tool.handler(input);
console.log(JSON.stringify(result, null, 2));
