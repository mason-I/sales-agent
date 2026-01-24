#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "273316909510";
const dealId = "222852280814";
const subject = "Your Zendesk invoice - Suite Professional, 25 agents";

const intro = `Thanks for confirming. Great news - your invoice is ready and the payment link is below.`;

const closing = `**Invoice Details:**
- **Plan:** Zendesk Suite Professional
- **Agents:** 25
- **Billing:** Month-to-month at $2,875/month

You can access your invoice and complete payment here:
https://app-ap1.hubspot.com/contacts/442479746/objects/0-53?filters=%5B%7B%22property%22%3A%22hs_object_id%22%2C%22operator%22%3A%22EQ%22%2C%22value%22%3A%22609433551343%22%7D%5D

Once payment is processed, you'll receive onboarding credentials and your account manager will reach out to schedule your implementation kickoff.

Let me know if you have any questions.`;

const body = [intro, closing, "Zendesk"].filter(Boolean).join("\n\n");

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
