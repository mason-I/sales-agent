#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "230850084322";
const subject = "Re: Quick question - Zendesk pricing";

// First fetch the deal to get the associated contact
const deal = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage`);

// Fetch associations to get contact ID
const associations = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`);

let contactId = dealId; // fallback
if (associations.results && associations.results.length > 0) {
  contactId = associations.results[0].id;
  console.log("Found contact ID:", contactId);
} else {
  console.log("No contact associated, using deal ID as fallback");
}

const intro = `Hi Marcus,

Thanks for reaching out and being upfront about your budget constraints. I appreciate that directness.

Zendesk Suite plans are priced per agent, starting with our Team plan (our most affordable option) and scaling up through Growth, Professional, and Enterprise tiers. To give you an accurate picture, pricing really depends on two key factors: your team size and which support channels you need.`;

const questions: string[] = [
  "So I can point you toward the right plan tier, how many support agents do you have on your team?",
  "Which support channels are you currently using or planning to use (email, chat, phone/SMS, social messaging)?"
];

const closing = `Once I understand your setup, I can give you a clear idea of whether Zendesk fits your budget. Full pricing details are also available at zendesk.com/pricing if you'd like to browse in the meantime.

Thanks,
Zendesk`;

const body = [intro, ...questions.map((q, i) => `${i + 1}) ${q}`), closing].filter(Boolean).join("\n\n");

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
