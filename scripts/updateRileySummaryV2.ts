import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Admitted Pain / Gap',
  stageGaps: ['key_challenges, ticket_volume_per_month, timeline_for_change, agents_required, support_channels'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: null, level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: 'Shared inbox getting messy with missed SLAs',
    challenges: ['Shared inbox chaos', 'Missed SLAs'],
    desiredOutcomes: ['Better organization', 'SLA compliance']
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: 12, support_channels: ['email', 'live_chat'], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-29T02:38:47.182Z', direction: 'outbound', type: 'EMAIL', summary: 'Sent overview of Zendesk omnichannel platform and asked what prompted their search.' },
    { timestamp: '2026-01-29T02:35:59.889Z', direction: 'inbound', type: 'EMAIL', summary: 'Initial exploratory inquiry: came across platform and wants to learn more.' },
    { timestamp: new Date().toISOString(), direction: 'inbound', type: 'EMAIL', summary: 'Shared context: 12 support reps, email + live chat channels, shared inbox with missed SLAs. Early exploration, no fixed timeline.' }
  ],
  agreedNextStep: null,
  openQuestions: ['ticket_volume_per_month', 'timeline_for_change'],
  narrative: 'New inbound inquiry from Riley Morgan. Exploring solutions for shared inbox chaos. Has 12 agents using email + live chat. Experiencing missed SLAs. Low urgency, just browsing. Need to capture volume and timeline to advance.'
};

await updateDealProperties('234309086693', {
  deal_summary: JSON.stringify(summary),
  sw_primary_pain: 'Shared inbox getting messy with missed SLAs',
  agents_required: 12,
  support_channels: 'email;live_chat'
});

console.log('Deal summary updated for Riley with pain point and sizing info');
