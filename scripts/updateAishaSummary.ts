import { hubspotRequest } from '../src/lib/hubspot.js';

const summary = {
  stage: 'Expressed Commercial Intent',
  stageGaps: ['sw_primary_pain - Primary pain point required to advance to Admitted Pain / Gap'],
  budget: { value: null, currency: 'USD', confidence: 'unknown' },
  authority: { decisionMaker: 'Aisha Mbatha - Director of Operations', level: 'decision_maker', needsApproval: [] },
  need: {
    primaryPain: null,
    challenges: ['Exploring support solutions for logistics operations', 'Current support setup unknown'],
    desiredOutcomes: ['Streamline customer communication around delivery status, claims, and account inquiries']
  },
  timeline: { deadline: null, urgency: 'low' },
  sizing: { agents_required: null, support_channels: [], ticket_volume_per_month: null },
  sentiment: 'neutral',
  objections: { open: [], resolved: [] },
  latestComms: [
    { timestamp: '2026-01-25T05:50:13.360Z', direction: 'outbound', type: 'email', summary: 'Sent nurture response acknowledging exploratory stage; 0 questions asked, left door open for future engagement.' },
    { timestamp: '2026-01-25T05:49:18.528Z', direction: 'inbound', type: 'email', summary: 'Acknowledged product overview, stated they are "just looking at options at this stage" - signals early exploration.' },
    { timestamp: '2026-01-25T05:46:12.826Z', direction: 'outbound', type: 'email', summary: 'Sent overview of Zendesk capabilities tailored to logistics; 0 questions asked - nurture approach.' }
  ],
  agreedNextStep: 'Await prospect follow-up when ready to engage further',
  openQuestions: ['Specific pain points in current support operations', 'Ticket volume per month', 'Agent count needed', 'Support channels required', 'Implementation timeline'],
  narrative: 'Aisha Mbatha, Director of Operations at Horizon Logistics Solutions Inc., reached out expressing interest in support solutions for their logistics operations. After receiving a tailored product overview, she replied acknowledging the information and stating they are "just looking at options at this stage." This is an early exploratory engagement with clear fatigue signals - not ready to commit or engage deeply. I sent a nurture response with 0 questions, leaving the door open for her to re-engage when ready. Deal remains in Expressed Commercial Intent; advancing to Admitted Pain/Gap requires identifying her primary pain point (sw_primary_pain), which will require waiting for her to signal readiness before attempting discovery.'
};

await hubspotRequest('PATCH', '/crm/v3/objects/deals/231691771323', {
  properties: { deal_summary: JSON.stringify(summary) }
});

console.log('Deal summary updated for Aisha Mbatha - Horizon Logistics Solutions Inc.');
