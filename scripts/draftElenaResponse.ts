#!/usr/bin/env bun
import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot.ts";

const dealId = "230905683390";
const subject = "Zendesk Pricing for Pinnacle Industries";

const intro = `Hi Elena,

Thanks for reaching out and for your interest in Zendesk.

Here's our pricing overview:

**Team**: $55/agent/month (billed annually)
- Basic omnichannel support (email, messaging, help center)
- Up to 50 AI-powered automated answers

**Growth**: $115/agent/month (billed annually)
- Everything in Team, plus:
- Multiple help centers, up to 100 AI answers
- Skills-based routing and self-service portal

**Professional**: $155/agent/month (billed annually)
- Advanced AI agents, custom reports, SLA management
- Community forums and collaboration tools

**Enterprise**: $209/agent/month (billed annually)
- Custom permissions, sandbox testing, real-time reporting

All plans include our ticketing system, unified agent workspace, and access to the Zendesk Marketplace for integrations.`;

const questions: string[] = [
  "So I can help you find the right plan, approximately how many agents would be using the platform?"
];

const closing = "Thanks,";

const body = [intro, ...questions, closing, "\nZendesk"].filter(Boolean).join("\n\n");

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

// Get contact ID from deal associations using the helper function
const contactAssociations = await fetchDealAssociations(dealId, "contacts");
const associatedContactId = contactAssociations[0]?.toObjectId;

if (associatedContactId) {
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${associatedContactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );
  console.log("Associated Contact ID:", associatedContactId);
}

await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
);

console.log("Email draft logged successfully!");
console.log("Email ID:", emailId);
console.log("Deal ID:", dealId);
