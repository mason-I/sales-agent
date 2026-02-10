#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "281529343460";
const dealId = "231256454623";
const subject = "Re: Quick question - Zendesk pricing for your comparison";

const intro = `Hi Tariq,

Glad the details were helpful. The triggers and round-robin routing will make a noticeable difference on that manual triage bottleneck you mentioned.

For 8 agents, here's what Zendesk Suite would cost:

**Team tier** – $55/agent/month
- Includes email + help center
- Built-in routing, triggers, and automation
- Works out of the box with quick setup

Annual commitment for your team: ~$5,280/year`;

const questions = [
  "So I can point you to the right comparison: which support channels do you need today—just email, or would messaging/voice be relevant down the road?"
];

const closing = `I know this is above the $1,000–$1,200 range you're seeing elsewhere, so let me address the difference directly: the premium reflects what you don't get from cheaper tools—reliable routing at scale, automation that actually works under load, and a system that grows with you rather than needing a replacement in 6–12 months.

Happy to answer more questions as you compare internally.

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
