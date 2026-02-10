import { updateDealSummary } from "../src/runtime/summary.js";

const summary = {
  stage: "Admitted Pain / Gap",
  stageGaps: [],
  budget: { value: 69000, currency: "USD", confidence: "mentioned" },
  authority: { decisionMaker: "Desmond Kim (COO)", level: "decision_maker", needsApproval: [] },
  need: {
    primaryPain: "Serious issues with current support solution causing customer complaints",
    challenges: [
      "tickets getting lost",
      "high response times",
      "customer complaints daily",
      "reputation damage",
      "current vendor is problematic/difficult",
      "concerns about losing historical tickets and customer data during migration",
      "need SLA features to address response time issues"
    ],
    desiredOutcomes: [
      "Quick switch from current platform (days, not weeks)",
      "Resolve customer complaints",
      "Reliable platform for 50+ agents",
      "High uptime SLA",
      "Understanding of migration process to ensure data integrity",
      "Concrete onboarding timeline with specific dates"
    ]
  },
  timeline: { deadline: null, urgency: "high" },
  sizing: { agents_required: 50, support_channels: ["email", "live_chat"], ticket_volume_per_month: 17500 },
  sentiment: "neutral",
  objections: {
    open: [],
    resolved: [
      "Implementation timeline concern - provided concrete day-by-day breakdown",
      "Uptime SLA question - confirmed 99.99% historical, 99.9% guaranteed",
      "Scalability concern - confirmed 50+ agents supported without performance issues",
      "Data migration concern - explained 3-step Marketplace partner process with data integrity guarantee",
      "Payment terms question - confirmed both annual and month-to-month options available"
    ]
  },
  latestComms: [
    {
      timestamp: "2026-01-25T04:25:03.908Z",
      direction: "outbound",
      type: "EMAIL",
      summary: "Answered payment terms (annual/monthly options) and provided concrete 7-day onboarding timeline: Days 1-2 setup, Day 3 migration, Days 4-5 training, Days 6-7 go-live. Asked if ready to proceed with Suite Professional."
    },
    {
      timestamp: "2026-01-25T04:22:03.945Z",
      direction: "inbound",
      type: "EMAIL",
      summary: "Confirmed 15,000-20,000 tickets/month across email and chat. Stated SLA features in Professional are necessary. Asked for payment terms and concrete onboarding timeline with specific live date."
    },
    {
      timestamp: "2026-01-25T04:19:54.215Z",
      direction: "outbound",
      type: "EMAIL",
      summary: "Provided full Suite tier pricing (Team $55, Growth $89, Professional $115, Enterprise $169) and explained 3-step data migration process with 1-3 day timeline. Asked for monthly ticket volume."
    }
  ],
  agreedNextStep: "Awaiting response on moving forward with Suite Professional - pricing and timeline questions answered",
  openQuestions: ["Timeline/deadline for change?", "Budget approval process?"],
  narrative: "Inbound inquiry from Desmond (COO, Pinnacle Digital LLC) with high urgency to switch from unreliable support platform. Prospect has explicitly selected Suite Professional tier ($115/agent/month) based on SLA feature requirements. Sizing complete: 50 agents, 17,500 tickets/month across email and chat. Budget approximately $69,000 annually. Payment terms (annual/monthly) and concrete onboarding timeline (7 days) provided. Awaiting decision to proceed to quote creation stage. Prospect has decision-maker authority as COO and expressed implementation urgency - wants to go live in days, not weeks."
};

await updateDealSummary("230841219535", summary);
console.log("Deal summary updated successfully");
