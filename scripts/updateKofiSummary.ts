import { updateDealProperties } from '../src/lib/hubspot.js';

const dealId = '230905905635';

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
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: { open: [], resolved: [] },
  latestComms: [
    {
      timestamp: '2026-01-25T05:46:19Z',
      direction: 'outbound',
      type: 'email',
      summary: 'Sent Zendesk platform overview and asked about main challenge he is looking to solve.'
    },
    {
      timestamp: '2026-01-25T05:45:11Z',
      direction: 'inbound',
      type: 'email',
      summary: 'Initial inquiry - looking into customer support solutions, requested info.'
    }
  ],
  agreedNextStep: null,
  openQuestions: [
    'What is the main challenge driving his search for a new support solution?',
    'Ticket volume, team size, and support channels needed',
    'Timeline for implementation',
    'Pricing expectations'
  ],
  narrative: 'New inbound inquiry from Kofi requesting general information about customer support solutions. He sent an initial exploratory email asking for info, and I responded with an overview of Zendesk unified platform capabilities (email, chat, phone, social messaging; ticket management; help centers; AI automation; analytics). I asked one discovery question to identify his primary pain point. Awaiting response.'
};

await updateDealProperties(dealId, {
  deal_summary: JSON.stringify(summary)
});

console.log('Deal summary updated for Kofi Okafor');
