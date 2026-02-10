import { createSalesMcpServer } from '../src/tools/mcp.ts';

const server = createSalesMcpServer();
const tool = server.tools.find(t => t.name === 'crm_logEmailDraft');

if (!tool) {
  console.error('Tool not found');
  process.exit(1);
}

const input = {
  contactId: '230850084322',
  dealId: '230850084322',
  subject: 'Re: Quick question - Zendesk pricing',
  bodyParts: {
    intro: 'Hi Marcus,\n\nThanks for reaching out and being upfront about your budget constraints. I appreciate that directness.\n\nZendesk Suite plans are priced per agent, starting with our Team plan (our most affordable option) and scaling up through Growth, Professional, and Enterprise tiers. To give you an accurate picture, pricing really depends on two key factors: your team size and which support channels you need.',
    questions: [
      'So I can point you toward the right plan tier, how many support agents do you have on your team?',
      'Which support channels are you currently using or planning to use (email, chat, phone/SMS, social messaging)?'
    ],
    closing: "Once I understand your setup, I can give you a clear idea of whether Zendesk fits your budget. Full pricing details are also available at zendesk.com/pricing if you'd like to browse in the meantime.\n\nThanks,\nZendesk"
  }
};

const result = await tool.handler(input);
console.log(JSON.stringify(result, null, 2));
