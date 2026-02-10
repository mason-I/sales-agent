import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['sw_primary_pain'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: 'Theresa Chen', level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: null,
    challenges: [],
    desiredOutcomes: ['Information about support platform for small logistics company']
  },
  timeline: { deadline: null, urgency: 'unknown' },
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: { open: [], resolved: [] },
  latestComms: [
    { timestamp: '2026-01-29T03:29:54.059Z', direction: 'outbound', type: 'EMAIL', summary: 'Sent informational response highlighting Zendesk benefits for logistics companies: unified inbox, shipment tracking, scalability, and quick setup.' },
    { timestamp: '2026-01-29T03:28:42.041Z', direction: 'inbound', type: 'INCOMING_EMAIL', summary: 'Initial inquiry asking what Zendesk offers for small logistics companies; indicates early exploratory interest.' }
  ],
  agreedNextStep: null,
  openQuestions: [
    'Current support setup/solution',
    'Primary pain points or challenges',
    'Agent count',
    'Support channels needed',
    'Ticket volume',
    'Timeline for implementation'
  ],
  narrative: 'Theresa Chen, Director of Operations at Chen Logistics Partners LLC, sent an initial inquiry asking what Zendesk offers for small logistics companies. I responded with an overview of relevant benefits including unified inbox, shipment tracking, scalability, and quick setup. The prospect is in early exploratory phase with fatigue signals present, so I used 0 questions and offered to continue the conversation when she\'s ready. Primary pain point and other BANT fields remain unqualified.'
};

await updateDealProperties('234365782472', {
  deal_summary: JSON.stringify(summary)
});

console.log('Deal summary updated');
