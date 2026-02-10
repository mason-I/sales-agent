#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231255928292";
const subject = "Re: Quick question - Zendesk vs Intercom";

const intro = `Thanks for reaching out, Priya. Great to hear you're evaluating options for Horizon Ventures' support team. Since you've looked at both Zendesk and Intercom, I'll focus on what sets us apart.`;

const questions: string[] = [
  "So I can share the most relevant details, what's driving your evaluation right now—are you looking to replace your current platform, or is this a new implementation?"
];

const closing = `**What differentiates Zendesk:**

**Intuitive agent workspace** — Zendesk Agent Workspace gives your team a single, unified view across all channels (email, chat, phone, social). Intercom can have a steeper learning curve with a more fragmented experience.

**Scalability** — We're built to grow with you. 1,800+ integrations (vs. ~450 for Intercom), robust APIs, and no-code customization. Many of our customers start as SMBs and stay with us through enterprise scale.

**AI built for CX** — Our AI is pre-trained on billions of real support interactions, powering intelligent workflows, AI agents, and copilot features. Teams implement Zendesk AI 5x faster than other solutions.

**Cost transparency** — Straightforward pricing with no hidden fees or surprise add-ons. Intercom's AI capabilities are paid add-ons on top of already complex pricing.

**Omnichannel native** — Email, SMS, phone, live chat, and social messaging all in one workspace. Intercom requires paid add-ons for critical channels like WhatsApp.

**Advanced analytics** — Custom dashboards, real-time reporting, workforce management, and drill-in attribution. Intercom's reporting is more basic.

Happy to dive deeper on any of these, or walk through specifics for your 25-agent use case.`;

const body = [intro, ...questions.map((q, i) => `${i + 1}) ${q}`), closing, "Zendesk"].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

// First, get the contact associated with this deal
const dealResponse = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname`);
console.log("Deal found:", dealResponse.properties?.dealname);

// Get associations
const associations = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`);
const contactId = associations.results?.[0]?.id;

if (!contactId) {
  console.error("No contact found for deal");
  process.exit(1);
}

console.log("Contact ID:", contactId);

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
