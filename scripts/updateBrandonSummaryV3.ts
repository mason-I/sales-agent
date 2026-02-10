import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Admitted Pain / Gap',
  stageGaps: [],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: null, level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: 'Ticket routing and response time consistency during growth/expansion',
    challenges: ['Growing pains with expansion - difficulty routing tickets correctly', 'Maintaining consistent response times as volume increased'],
    desiredOutcomes: ['Better ticket routing', 'Consistent response times', 'Handle volume growth smoothly']
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: 20, support_channels: ['email', 'voice', 'social_messaging'], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-29T03:15:26Z', direction: 'outbound', type: 'email', summary: 'Nurture response: acknowledged pain points, explained routing/automation fit, invited reconnection when ready - no questions asked' },
    { timestamp: '2026-01-29T03:12:26Z', direction: 'outbound', type: 'email', summary: 'Acknowledged expansion timing constraints; asked about main challenge driving platform exploration' },
    { timestamp: '2026-01-29T03:10:33Z', direction: 'inbound', type: 'email', summary: 'Provided sizing (20 agents) and confirmed pain points: ticket routing and response time consistency issues; signaled will reach out post-expansion' }
  ],
  agreedNextStep: 'Brandon will reach out when things settle down after expansion',
  openQuestions: ['Current support tools/system', 'Timeline for change', 'Ticket volume per month', 'Budget constraints'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in Zendesk for their support team. He provided sizing details (20 agents, email/phone/minimal social messaging) and confirmed his primary pain point: ticket routing and response time consistency issues due to growth from expansion. He signaled fatigue due to a major expansion wrapping up and said he will reach out once things settle down. The agent responded with a nurture approach, acknowledging the pain points, explaining how Zendesk routing/automations address those specific issues, and wishing him luck with the expansion - no questions asked. Deal now qualified to Admitted Pain / Gap stage with primary pain and key challenges captured.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated - advanced to Admitted Pain / Gap');
