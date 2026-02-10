import { updateDealSummary } from "../src/runtime/summary";

const summary = {
  stage: "Established Timeline",
  stageGaps: [],
  budget: { value: 1824, currency: "USD", confidence: "confirmed" },
  authority: { decisionMaker: "Marcus Okonkwo", level: "decision_maker", needsApproval: [] },
  need: {
    primaryPain: "Manual ticket assignment causing delays, tickets sit in queue too long waiting to be claimed, response times suffering",
    challenges: [
      "manual ticket assignment",
      "tickets sit in queue too long",
      "response times suffering",
      "tight budget constraints",
      "manual routing becoming bottleneck as volume increases"
    ],
    desiredOutcomes: [
      "faster routing to right agent",
      "eliminate manual assignment",
      "improve response times"
    ]
  },
  timeline: { deadline: "2026-02-08", urgency: "high" },
  sizing: { agents_required: 8, support_channels: ["email"], ticket_volume_per_month: 900 },
  sentiment: "positive",
  objections: {
    open: [],
    resolved: [
      "pricing question - Support Team at $1,824/year fits budget",
      "discount request - declined, explained fixed catalog pricing",
      "mid-tier request - declined, no mid-tier between Support and Suite",
      "onboarding question - explained self-service setup with training resources"
    ]
  },
  latestComms: [
    {
      timestamp: "2026-01-25T05:59:08Z",
      direction: "outbound",
      type: "EMAIL",
      summary: "Sent formal quote: $1,824/year for Support Team (8 agents × $19/mo); included purchase link to zendesk.com/buy."
    },
    {
      timestamp: "2026-01-25T05:58:01Z",
      direction: "inbound",
      type: "EMAIL",
      summary: "Provided timeline (1-2 weeks ASAP), confirmed self-service setup is sufficient, requested formal quote."
    },
    {
      timestamp: "2026-01-25T05:55:56Z",
      direction: "outbound",
      type: "EMAIL",
      summary: "Explained self-service setup includes on-demand training and implementation guides; asked for implementation timeline."
    }
  ],
  agreedNextStep: "Await purchase - quote sent with purchase link",
  openQuestions: [],
  narrative: "Marcus Okonkwo from Apex Routing Solutions (Head of Support, 8 agents) reached out about Zendesk's routing solution with immediate pricing concerns due to tight budget. I provided catalog pricing: Support Team ($152/mo) and Suite Team ($440/mo). Marcus confirmed Support Team fits budget and admitted his pain: manual ticket assignment, tickets sitting in queue too long, slow response times. He asked about pricing flexibility or mid-tier options. I explained Support Team includes the auto routing he needs (skills-based, round-robin, load-balancing), confirmed no mid-tier or discounts available. Marcus then provided ticket volume (800-1,000/month) and confirmed email-only channels, and asked about onboarding. I explained Support Team is self-service with on-demand training resources. Marcus then confirmed self-service is sufficient, provided timeline of 1-2 weeks (ASAP), and requested a formal quote. I sent the formal quote with pricing breakdown and purchase link."
};

await updateDealSummary("231691771324", summary);
console.log("Deal summary updated successfully");
