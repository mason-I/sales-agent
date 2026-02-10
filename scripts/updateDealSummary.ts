import { HubSpotApiClient } from '../src/runtime/api.js';

const client = new HubSpotApiClient();

const summary = {
  stage: 'Admitted Pain / Gap',
  stageGaps: ['ticket_volume_per_month required to advance to Defined Scope & Impact'],
  budget: { value: null, currency: 'USD', confidence: 'mentioned' },
  authority: { decisionMaker: null, level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: 'Slow response times and missed messages due to fragmented support channels',
    challenges: ['slow response times', 'missing messages across different channels (email, chat, social)', 'messages falling through cracks', 'need to consolidate all channels in one place'],
    desiredOutcomes: ['Consolidated omnichannel workspace', 'Eliminate missed messages', 'Faster response times']
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: 8, support_channels: ['email', 'live_chat', 'social_messaging'], ticket_volume_per_month: 650 },
  sentiment: 'hesitant',
  objections: {
    open: ['Budget constraints - $4,400 annually exceeds budget; evaluating Freshdesk at roughly half the price', 'No case studies from logistics companies switching from Freshdesk'],
    resolved: ['Discount request - declined (no discounts available)']
  },
  latestComms: [
    { timestamp: '2026-01-25T03:59:52Z', direction: 'outbound', type: 'email', summary: 'Explained no logistics-specific case studies available; emphasized unified Agent Workspace as consistently cited advantage; asked if she wants formal quote' },
    { timestamp: '2026-01-25T03:58:03Z', direction: 'inbound', type: 'email', summary: 'Confirmed 600-700 tickets/month; said $4,400 annually is above budget but can see value; requested case studies from logistics companies who switched from Freshdesk' },
    { timestamp: '2026-01-25T03:55:57Z', direction: 'outbound', type: 'email', summary: 'Explained advantages over Freshdesk (unified workspace, pre-trained AI, scalability); cited 42% response time improvement; quoted Suite Team at $55/agent/month' }
  ],
  agreedNextStep: null,
  openQuestions: ['Timeline for implementation', 'Decision-maker authority', 'Specific budget limit', 'Whether formal quote is desired to move forward'],
  narrative: 'Theresa Okonkwo from Summit River Logistics submitted a pricing inquiry citing budget constraints and early exploration. After receiving catalog pricing, she confirmed the Team plan ($19/agent/month for 8 agents = ~$152/month) could work and requested a startup discount, which was declined per policy. She then revealed her actual pain point: slow response times and missed messages due to fragmented channels (email, chat, social) needing consolidation. She\'s directly comparing to Freshdesk at roughly half the price. The agent responded with Zendesk advantages (unified Agent Workspace vs. Freshdesk\'s multiple tabs, pre-trained AI vs. manual training, scalability) and quoted Suite Team at $55/agent/month (necessary for omnichannel). Theresa confirmed 600-700 tickets/month, acknowledged $4,400 annually exceeds budget but said she can see value if it solves missed messages, and requested case studies from logistics companies who switched from Freshdesk. Agent responded no specific logistics case studies available but emphasized unified Agent Workspace advantage. Awaiting decision on formal quote request.'
};

await client.crm.updateDealProperties('231703070186', {
  deal_summary: JSON.stringify(summary)
});

console.log('Deal summary updated');
