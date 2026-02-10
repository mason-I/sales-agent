#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "282018510323";
const dealId = "230905712114";
const subject = "Re: Quick question";

const intro = `Hi Javier,

Thanks for reaching out! I'd be happy to share what we offer.`;

const bodyContent = `Zendesk provides a complete customer service platform that helps logistics companies like Meridian Logistics deliver seamless support across every channel. Our key capabilities include:

* **Omnichannel support:** Email, chat, phone, social messaging, and help center in one unified workspace
* **Self-service options:** Knowledge base and AI-powered bots to deflect common questions
* **Automation and workflows:** Route inquiries automatically, trigger actions based on customer status, and streamline repetitive tasks
* **Analytics and reporting:** Track performance, customer satisfaction, and operational metrics
* **Scalability:** Grow from a small team to enterprise operations without switching platforms

Many logistics teams use us to handle shipment tracking inquiries, delivery updates, claims processing, and partner communications more efficiently.`;

const questions: string[] = [
  `To help me share the most relevant information, could you tell me a bit about your current support setup? Specifically, what channels are you using to handle customer inquiries (email, phone, chat, etc.) and what's the main challenge you're hoping to solve?`
];

const closing = `Thanks,

Zendesk`;

const body = [intro, bodyContent, ...questions, closing].filter(Boolean).join("\n\n");

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
