import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['Primary pain point required to advance to Admitted Pain / Gap'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: null, level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: null,
    challenges: [],
    desiredOutcomes: []
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: 20, support_channels: ['email', 'voice', 'social_messaging'], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-29T03:12:30Z', direction: 'outbound', type: 'email', summary: 'Acknowledged expansion timing constraints; asked about main challenge driving platform exploration' },
    { timestamp: '2026-01-29T03:08:02Z', direction: 'outbound', type: 'email', summary: 'Provided overview of Zendesk capabilities; asked about team size and support channels' },
    { timestamp: '2026-01-29T03:06:05Z', direction: 'inbound', type: 'email', summary: 'Initial inquiry expressing interest in learning more about Zendesk; exploring options' }
  ],
  agreedNextStep: null,
  openQuestions: ['Primary pain points driving the inquiry', 'Current support tools/system', 'Timeline for change', 'Ticket volume per month', 'Budget constraints'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in learning more about Zendesk for their support team. In his follow-up, he provided sizing details: 20 agents handling primarily email and phone support, with minimal social messaging. He signaled fatigue due to a major expansion wrapping up, indicating potential slow response times. The agent responded with a nurture approach, acknowledging the expansion priority and asking one targeted question about the main challenge driving their platform exploration. Key qualification details still needed: primary pain points, current support tools, timeline for change, ticket volume, and budget.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated with sizing info');
