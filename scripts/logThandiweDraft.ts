import { createSalesMcpServer } from '../src/tools/mcp';

const server = createSalesMcpServer();
const tool = server.instance.getTool('crm_logEmailDraft');

const result = await tool({
  contactId: "286931683774",
  dealId: "236371713508",
  subject: "Re: Quick question",
  bodyParts: {
    intro: "Thanks for clarifying — no problem at all. It's a good time to understand what's out there.",
    questions: [
      "So I can point you toward the most relevant options, what prompted you to explore support tools right now?"
    ],
    closing: "Zendesk"
  }
});

console.log(JSON.stringify(result, null, 2));
