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
    { timestamp: '2026-01-29T03:20:34Z', direction: 'outbound', type: 'email', summary: 'Brief acknowledgment; glad things leveling out; 0 questions - awaiting his re-initiation' },
    { timestamp: '2026-01-29T03:20:30Z', direction: 'inbound', type: 'email', summary: 'Update: expansion leveling out, will be in touch soon' },
    { timestamp: '2026-01-29T03:17:37Z', direction: 'outbound', type: 'email', summary: 'Brief closing message; wished smooth expansion wrap-up; 0 questions' }
  ],
  agreedNextStep: 'Brandon will be in touch when ready to revisit',
  openQuestions: ['Current support tools/system', 'Timeline for change', 'Ticket volume per month', 'Budget constraints'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in Zendesk for their support team. He provided sizing details (20 agents, email/phone/minimal social messaging) and confirmed his primary pain point: ticket routing and response time consistency issues due to growth from expansion. He initially paused the conversation due to expansion chaos, stating he would circle back when bandwidth allowed. He later provided an update that things are leveling out and he will be in touch soon. The agent responded with brief acknowledgment and 0 questions. Deal qualified to Admitted Pain / Gap stage and remains in nurture mode awaiting Brandon re-initiation when ready.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated - expansion leveling out');
