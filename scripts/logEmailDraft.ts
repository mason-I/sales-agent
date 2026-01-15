#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "271435706829";
const dealId = "221578086905";
const subject = "Formal Quote: Zendesk Professional for 25 Agents";

const intro = `Thanks for confirming the channels, Marcus. Here's the formal quote for your review.`;

const questions: string[] = []; // No questions - prospect has what they need

const closing = `Based on our conversation, here's the breakdown:

**Zendesk Suite Professional - 25 Agents**
- **$115 per agent/month**
- **Monthly total: $2,875**
- **Annual commitment: $34,500**

**What's included at Professional:**
- Omnichannel routing (email + phone unified – no add-ons needed)
- Built-in collaboration tools (internal side conversations, skills-based routing) to reduce those handoff/escalation issues you mentioned
- Self-service help center foundation
- Standard analytics and reporting

**Implementation:** Your April 15, 2025 timeline is well within standard onboarding windows.

As you compare against the Freshdesk proposal, a few things worth noting:
- Zendesk's collaboration features are native at Professional (no extra tiers required)
- Our omnichannel routing unifies email and phone without additional modules

Let me know what questions come up as you review with finance.`;

const body = [intro, ...questions, closing, "Zendesk"].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

const emailProperties = {
  hs_email_direction: "EMAIL",
  hs_email_status: "SENT",
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

const created = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
const emailId = created.id;

if (!emailId) {
  console.error("Failed to create email");
  process.exit(1);
}

await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
);

await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
);

// Update deal with support channels and pricing info
await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
  properties: {
    support_channels: "email; voice",
    amount: "34500"
  }
});

console.log("Email draft logged successfully!");
console.log("Email ID:", emailId);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
