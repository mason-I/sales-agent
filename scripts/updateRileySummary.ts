import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['sw_primary_pain required'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: null, level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: null,
    challenges: [],
    desiredOutcomes: []
  },
  timeline: { deadline: null, urgency: 'unknown' },
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-29T02:38:47.182Z', direction: 'outbound', type: 'EMAIL', summary: 'Sent overview of Zendesk omnichannel platform and asked what prompted their search.' },
    { timestamp: '2026-01-29T02:35:59.889Z', direction: 'inbound', type: 'EMAIL', summary: 'Initial exploratory inquiry: came across platform and wants to learn more.' }
  ],
  agreedNextStep: null,
  openQuestions: ['what brought you to look for a support solution right now?'],
  narrative: 'New inbound inquiry from Riley Morgan. Sent exploratory outreach with platform overview and discovery question to understand their motivation for seeking a solution.'
};

await updateDealProperties('234309086693', {
  deal_summary: JSON.stringify(summary)
});

console.log('Deal summary updated for Riley');
