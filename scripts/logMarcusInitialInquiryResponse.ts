#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "230848423416";
const contactId = "282018485697";

const subject = "Re: What Zendesk offers";

const intro = `Hi Marcus,

Thanks for reaching out! Great to hear you're exploring support platform options.

Zendesk is a complete customer service platform that brings all your support channels into one place. Our Suite includes email, chat, messaging (social channels like WhatsApp and Facebook), help center/knowledge base, and voice (on higher tiers). Teams use us to scale support efficiently, keep customers happy, and self-serve 24/7 via a knowledge base.`;

const questions: string[] = [
  "So I can point you toward the right fit, what's the main challenge you're looking to solve with a new support platform?"
];

const closing = `Happy to share more details once I understand what matters most for your setup.

Thanks,
Zendesk`;

const body = [intro, ...questions, closing].filter(Boolean).join("\n\n");

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
