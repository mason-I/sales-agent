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
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: {
    open: [],
    resolved: []
  },
  latestComms: [
    { timestamp: '2026-01-29T03:08:02Z', direction: 'outbound', type: 'email', summary: 'Provided overview of Zendesk capabilities; asked about team size and support channels to guide information' },
    { timestamp: '2026-01-29T03:06:05Z', direction: 'inbound', type: 'email', summary: 'Initial inquiry expressing interest in learning more about Zendesk for their support team; exploring options' }
  ],
  agreedNextStep: null,
  openQuestions: ['Current support setup/tools', 'Team size/agent count', 'Primary pain points', 'Timeline for implementation', 'Ticket volume', 'Support channels needed'],
  narrative: 'Brandon from Meridian Logistics Corp submitted an initial inquiry expressing interest in learning more about Zendesk for their support team. He mentioned they are exploring options but have been busy on their end. He asked for the best way to get information about the platform. This is a first touch with no prior engagement history. The agent responded with an overview of Zendesk capabilities (unified conversations across channels, scalability, faster resolutions) and asked about team size and support channels to provide more targeted information. Key qualification details remain unknown: current support setup, team size, pain points, timeline, ticket volume, and required support channels.'
};

await updateDealProperties('234318104000', {
  deal_summary: JSON.stringify(summary)
});

console.log('Brandon deal summary updated');
