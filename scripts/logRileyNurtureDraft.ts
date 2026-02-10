import { createSalesMcpServer } from '../src/tools/mcp.ts';

const server = createSalesMcpServer();
const tool = server.instance._registeredTools['crm_logEmailDraft'];

if (!tool) {
  console.error('Tool not found');
  process.exit(1);
}

const input = {
  contactId: '284936010221',
  dealId: '234309086693',
  subject: 'Re: Quick question',
  bodyParts: {
    intro: "Thanks for the context. 12 agents on email + live chat with a shared inbox is exactly where a lot of teams start feeling the pain—tickets get buried, SLAs slip, and it's hard to see who's working on what.",
    questions: [
      "Roughly how many tickets are you handling per week so I can frame up what would fit your team?"
    ],
    closing: "No pressure on the timeline—happy to share info as you explore."
  }
};

const result = await tool.handler(input);
console.log(JSON.stringify(result, null, 2));
