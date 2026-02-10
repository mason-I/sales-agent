#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "282226128353";
const dealId = "231680955886";
const subject = "Re: Quick question";

const intro = `Hi Jamal,

Great questions—glad the pricing feels workable.`;

const questions: string[] = [
  "Since you mentioned requesting a quote, what's your roughly monthly ticket volume? This helps me ensure the pricing matches your actual usage and I can get that quote over to you."
];

const closing = `**ROI Timeline:** Most teams see meaningful improvements in response times within the first 2-4 weeks. The early wins typically come from better visibility into who's handling what (eliminating duplicate responses) and faster triage. The gains compound as the system learns your routing patterns.

**Hidden Costs:** None. The $152/month is all-in—no implementation fees, onboarding costs, or setup charges. You're up and running quickly.`;

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
