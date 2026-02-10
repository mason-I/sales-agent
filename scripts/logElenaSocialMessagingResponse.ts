#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.js";

const contactId = "282018485697";
const dealId = "230905683390";
const subject = "Re: Quick question";

const intro = "Great question - and yes, social messaging is absolutely included in the Support Team tier at $19/agent/month. This is a core feature, not an add-on.";

const details = `**Social channels included:**

**Public channels:**
- Facebook (wall posts and comments)
- X/Twitter (tweets, mentions, replies)

**Private channels (DMs):**
- WhatsApp
- Instagram Direct
- Facebook Messenger
- X Direct Messages
- LINE
- WeChat
- Apple Messages for Business

All of these feed into a single Agent Workspace inbox, so your team can manage every customer conversation from one place - no more switching between platforms or missing DMs.

This should directly solve the challenge you mentioned with scattered social media inquiries.`;

const closing = `Since the $1,824/year fits comfortably within your $5,000 budget and the tier includes everything you need, shall I create the formal quote for 8 agents?

Zendesk`;

const body = [intro, details, closing].filter(Boolean).join("\n\n");

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
