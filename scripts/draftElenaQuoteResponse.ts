#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.js";

const contactId = "281284792825";
const dealId = "230850077154";
const subject = "Re: Urgent - Need to replace our current support solution ASAP";

const intro = "Great, thanks for confirming your team size. For 52 agents on the Team tier, that works out to $2,860/month.";

const questions = [];

const closing = `**Your Formal Quote:**
- Plan: Zendesk Suite Team
- Agents: 52
- Price: $55/agent/month
- **Monthly Total: $2,860**

Quote ID: 213871762901 (attached to your deal)

**Implementation Timeline:**
Once you sign, we can typically get new Team tier customers live within 2-3 business days. This means you could be fully operational well before your January 31st deadline.

The onboarding process is straightforward—you'll have access to our guided setup flow, and your team can start routing tickets immediately. Data migration from your current vendor depends on their export capabilities, but most teams complete the full transition in under a week.

Please review the quote and let me know if you have any questions or would like to proceed.`;

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

console.log("Email draft logged successfully!");
console.log("Email ID:", emailId);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
