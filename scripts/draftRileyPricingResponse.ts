#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = "273316909510";
const dealId = "222852280814";
const subject = "Re: Quick question";

const intro = `Hi Riley,

Thanks for sharing those details! 25 agents handling 4,000 tickets/month across email, chat, and social is solid scale - it makes sense that you'd outgrow a basic help desk.

Here's pricing for Zendesk Suite Professional, which unifies all three channels in one workspace:

**Zendesk Suite Professional**
- 25 agents @ $115/agent/month
- **Monthly: $2,875**
- **Annual: $34,500**

This includes your help center, self-service tools, and reporting to help you track those 4k tickets efficiently as you continue growing.`;

const closing = `Would you like me to put together a formal quote for your review?

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
console.log("\n--- EMAIL BODY ---");
console.log(body);
