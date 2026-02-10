#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "281530855920";
const dealId = "231298774497";
const subject = "Invoice: Zendesk Professional - 50 Agents";

const intro = `Glad the Professional tier is the right fit. I completely understand the urgency—let's get this moving.

To confirm on support channels: yes, email and live chat are included at Professional, and we'll configure both from day one. You'll be set to handle tickets across both channels immediately.

The invoice is attached below for your internal processing. Once you're ready, payment can be processed and we'll get your onboarding started.`;

const questions: string[] = [];

const closing = `**Zendesk Suite Professional - 50 Agents**
- **$115 per agent/month**
- **Monthly total: $5,750**
- **Annual commitment: $69,000**

**What's included at Professional:**
- Email and live chat (configured day 1)
- Omnichannel routing to unify both channels
- Built-in collaboration tools for seamless handoffs
- Self-service help center foundation
- Standard analytics and reporting

**Implementation:**
- Week 1: Basic ticket routing live for email and chat
- Full implementation: 2-3 weeks
- We'll prioritize getting your routing configured immediately to address the current situation

Let me know if you need anything else to move forward internally.`;

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

// Update deal with support channels confirmed
await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
  properties: {
    support_channels: "email; live_chat",
    amount: "69000"
  }
});

console.log("Email draft logged successfully!");
console.log("Email ID:", emailId);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
