import { hubspotRequest } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['ticket_volume_per_month', 'timeline_for_change'],
  budget: { value: 150, currency: 'USD', confidence: 'mentioned' },
  authority: { decisionMaker: 'Carlos Martinez (Head of Support)', level: 'decision_maker', needsApproval: [] },
  need: {
    primaryPain: 'Response times during peak shipping days - agents duplicate work and miss urgent requests when multiple customers need updates on same shipment',
    challenges: ['Small operation with tight budget ceiling', 'Currently using basic shared inbox setup', 'Chaotic peak shipping days with duplicated work and missed urgent requests'],
    desiredOutcomes: ['Improve customer service']
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: 8, support_channels: ['email'], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: ['Tight budget ceiling - $152/month adds up quickly', 'Discount request - asked about startup/introductory pricing'],
    resolved: ['Offered annual billing (~20% savings: $120/mo for 8 agents)']
  },
  latestComms: [
    { timestamp: '2026-01-25T05:17:45.065Z', direction: 'outbound', type: 'EMAIL', summary: 'Declined discount request, explained annual billing saves ~20% ($120/mo vs $152/mo for 8 agents), asked timeline question.' },
    { timestamp: '2026-01-25T05:16:12.597Z', direction: 'inbound', type: 'EMAIL', summary: 'Confirmed 8 agents, primary pain (peak shipping chaos, duplicated work, missed urgent requests), asked about discounts/annual billing.' },
    { timestamp: '2026-01-25T05:13:23.212Z', direction: 'outbound', type: 'EMAIL', summary: 'Provided catalog pricing (Support Team $19/agent/mo, Suite Team $55/agent/mo), asked about primary challenge.' }
  ],
  agreedNextStep: 'Awaiting response on timeline for tackling peak shipping chaos',
  openQuestions: ['What is the specific budget ceiling amount?', 'What is the ticket volume per month?', 'What is the timeline for implementation?', 'When would they want to tackle the peak shipping chaos?'],
  narrative: 'Carlos Martinez from Martinez Logistics Solutions, LLC (small logistics operation) reached out requesting pricing while researching support tools. Initially mentioned tight budget constraint. After receiving pricing, confirmed 8 agents ($152/month monthly billing), admitted primary pain (response times during peak shipping days, duplicated work, missed urgent requests when multiple customers ask about same shipment), and asked about startup/introductory discounts. Declined discount request but offered annual billing (~20% savings to $120/month). Asked timeline question to gauge urgency. Key gaps: ticket volume not quantified, timeline unknown, specific budget ceiling amount not specified.'
};

await hubspotRequest('PATCH', '/crm/v3/objects/deals/231747982817', {
  properties: {
    deal_summary: JSON.stringify(summary)
  }
});

console.log('Deal summary updated');
