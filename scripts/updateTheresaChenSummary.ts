import { updateDealProperties } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['Primary pain point required to advance to Admitted Pain / Gap'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: 'Theresa Chen (Director of Operations)', level: 'unknown', needsApproval: [] },
  need: {
    primaryPain: null,
    challenges: [],
    desiredOutcomes: []
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-25T04:04:25.720Z', direction: 'outbound', type: 'EMAIL', summary: 'Sent nurture-close acknowledgment with 0 questions, leaving door open for future re-engagement' },
    { timestamp: '2026-01-25T04:03:14.092Z', direction: 'inbound', type: 'EMAIL', summary: 'Final brief "Thanks" sign-off - conversation appears to be concluding' },
    { timestamp: '2026-01-25T04:01:51.008Z', direction: 'outbound', type: 'EMAIL', summary: 'Sent nurture response respecting exploration phase, no questions asked' }
  ],
  agreedNextStep: null,
  openQuestions: ['Primary pain point not identified', 'Current support setup unknown', 'Timeline for change unknown', 'Agent count unknown', 'Support channels unknown', 'Budget expectations unknown'],
  narrative: 'Theresa Chen at Meridian Logistics Corp sent a minimal initial inquiry stating only "we\'re exploring support solutions." Throughout the conversation, she provided consistently brief, low-effort responses: "Thanks. We\'ll take a look", "Will do", "We\'re still figuring that out", "Thanks", "Just exploring options", and a final "Thanks" sign-off. This pattern clearly signals early-stage exploration with no urgency and limited engagement. Sent nurturing responses with 0-1 lightweight questions to respect pace. Prospect appears to be concluding research phase without moving to discovery. Extensive unknowns remain across all qualification dimensions (pain, challenges, timeline, sizing, channels, budget).'
};

await updateDealProperties('230848584165', {
  deal_summary: JSON.stringify(summary)
});

console.log('Deal summary updated for Theresa Chen (230848584165)');
