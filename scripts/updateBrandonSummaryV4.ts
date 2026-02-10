import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Admitted Pain / Gap',
  stageGaps: [],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: null, 'level': 'unknown', needsApproval: [] },
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
    { timestamp: '2026-01-29T03:17:55Z', direction: 'outbound', 'type': 'email', summary: 'Brief closing message; wished smooth expansion wrap-up; 0 questions - deal in pause mode' },
    { timestamp: '2026-01-29T03:17:50Z', direction: 'inbound', 'type': 'email', summary: 'Confirmed will circle back when more bandwidth available; acknowledged routing capabilities' },
    { timestamp: '2026-01-29T03:15:22Z', direction: 'outbound', 'type': 'email', summary: 'Nurture response: acknowledged pain points, explained routing/automation fit, invited reconnection when ready' }
  ],
  agreedNextStep: 'Brandon will circle back when he has more bandwidth post-expansion',
  openQuestions: ['Current support tools/system', 'Timeline for change', 'Ticket volume per month', 'Budget constraints'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in Zendesk for their support team. He provided sizing details (20 agents, email/phone/minimal social messaging) and confirmed his primary pain point: ticket routing and response time consistency issues due to growth from expansion. After learning about Zendesk routing capabilities, he acknowledged the fit and explicitly stated he will circle back when he has more bandwidth, signaling a clear pause in the conversation. The agent responded with a brief, supportive closing message and 0 questions. Deal qualified to Admitted Pain / Gap stage and now in nurture/pause mode awaiting Brandon re-initiation when expansion wraps up.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated - pause mode confirmed');
