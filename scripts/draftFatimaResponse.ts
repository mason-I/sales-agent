#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "281991124468";
const dealId = "231026996678";
const subject = "Re: Quick question";

const intro = `Hi Fatima,

Thanks for reaching out. Happy to share pricing to help with your evaluation.

Per the published Zendesk catalog, our plans are priced per agent/month:

**Support Team** - $19/agent/month
Essential ticketing, help center, and basic automation

**Suite Team** - $55/agent/month
Support Team features plus email, chat, and social messaging in one unified workspace

For more advanced needs, Growth ($89) and Professional ($115) tiers add analytics, AI-powered agents, and deeper automation.

I understand you're working with a tight budget this quarter. Zendesk is designed to deliver ROI quickly out of the box, and Team plans are built to scale with you as you grow.`;

const questions: string[] = [
  "So I can point you at the right fit, what support channels are your customers using today (email, chat, phone, social)?"
];

const closing = `Best`;

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
