#!/usr/bin/env bun
import { logEmailEngagement, updateDealProperties } from "../src/lib/hubspot.ts";

const contactId = "281288465868";
const dealId = "230846533051";

const subject = "Next steps to get started";

const intro = `Thanks for confirming, Aisha. Great to hear you're ready to move forward.`;

const questions: string[] = [];

const closing = `Here's what happens next:

**Your plan summary:**
- Zendesk Support Team: 8 agents at $19/agent/month
- Monthly total: $152 (billed annually)
- Annual commitment: $1,824

**To get started:**
1. Visit zendesk.com/pricing and select the Support Team plan
2. Sign up with your work email
3. Add your 8 agents during setup
4. You can start using it immediately - setup typically takes a few hours to a day

**What you'll get:**
- Ticket organization (no more lost messages or duplicates)
- Visibility into ticket status for your entire team
- Basic reporting to track performance

If you have any questions during setup, feel free to reach out. Otherwise, welcome to Zendesk!

Best,
Zendesk`;

const body = [intro, ...questions, closing].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

// Log the email
await logEmailEngagement(
  {
    subject,
    body,
    fromEmail: "support@zendesk.com",
    fromName: "Zendesk",
    toEmail: "aisha.patel-23e6cc57-0@eval-176559.com",
    direction: "EMAIL"
  },
  contactId,
  dealId
);

// Update deal with pricing discussed
await updateDealProperties(dealId, {
  amount: "1824",
  agents_required: "8",
  support_channels: "email"
});

console.log("Email draft logged successfully!");
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
