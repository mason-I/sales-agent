#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = "273316909510";
const dealId = "222852280814";
const subject = "Pricing & Draft Invoice - Zendesk Suite Professional";

const intro = `Hi Riley,

Thanks for the details on your requirements - 25 agents across email, chat, and social with ~4k tickets/month. Zendesk Suite Professional is the right fit for unifying those channels.

I've created a draft invoice for your review. Here's the pricing:

**Zendesk Suite Professional**
- 25 agents @ $115/agent/month
- **Monthly: $2,875**
- **Annual: $34,500**

Suite Professional includes unified email, chat, and social messaging in one workspace, plus help center, self-service tools, and reporting to help you track those 4k tickets efficiently.

For your 6-week go-live timeline, the onboarding is straightforward and we can have you up and running well within that window.`;

const closing = `The draft invoice (Quote ID: 205304452556) has been attached to your account and is ready for review.

Let me know if you'd like to proceed or if you have any questions on the quote.

Zendesk`;

const body = [intro, closing].filter(Boolean).join("\n\n");

const emailProperties = {
  hs_email_direction: "EMAIL",
  hs_email_status: "SENT",
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

console.log("Creating email engagement...");
const email = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
const emailId = email.id;
console.log("Email created:", emailId);

// Associate to contact
await hubspotRequest("PUT", `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`, [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]);
console.log("Associated to contact:", contactId);

// Associate to deal
await hubspotRequest("PUT", `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`, [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]);
console.log("Associated to deal:", dealId);

console.log("\n--- EMAIL LOGGED ---");
console.log("Subject:", subject);
console.log("Email ID:", emailId);
