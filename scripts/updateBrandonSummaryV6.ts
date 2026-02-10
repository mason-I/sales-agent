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
    { timestamp: '2026-01-29T03:23:19Z', direction: 'outbound', type: 'email', summary: 'Closed proactive outreach; left door open for his re-initiation - 0 questions' },
    { timestamp: '2026-01-29T03:23:15Z', direction: 'inbound', type: 'email', summary: 'Unexpected operational issues; unsure when can circle back; will reach out if/when timing works' },
    { timestamp: '2026-01-29T03:20:31Z', direction: 'outbound', type: 'email', summary: 'Brief acknowledgment; glad things leveling out; 0 questions' }
  ],
  agreedNextStep: 'Brandon will reach out if/when timing works out on his end',
  openQuestions: ['Current support tools/system', 'Timeline for change', 'Ticket volume per month', 'Budget constraints'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in Zendesk for their support team. He provided sizing details (20 agents, email/phone/minimal social messaging) and confirmed his primary pain point: ticket routing and response time consistency issues due to growth from expansion. After multiple pause signals due to expansion, he later reported unexpected operational issues came up and he is unsure when he can circle back. He explicitly stated he will reach out if/when the timing works out. The agent responded by closing proactive outreach on our end while leaving the door open for his re-initiation. Deal qualified to Admitted Pain / Gap stage and now in long-term nurture/pause awaiting Brandon to re-engage when ready.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated - long-term pause due to operational issues');
