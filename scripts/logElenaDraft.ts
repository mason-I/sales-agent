import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = '281987239359';
const dealId = '230905683390';
const subject = 'Re: Quick question';

const intro = "Thanks for sharing those details about your challenges with scattered inquiries and inconsistent response times. That context helps a lot.";
const questions = [];
const closing = "Great news on the budget — at $152/month ($1,824 annually), you're well under your $5,000 target. Regarding startup discounts: we don't offer additional discounts, but the Support Team tier at $19/agent is already priced as our most affordable option and works well for teams like yours. Would you like me to send over a formal quote for 8 agents to get you started?";

const body = [intro, closing].filter(Boolean).join("\n\n") + "\n\nZendesk";

const emailProperties = {
  hs_email_direction: "EMAIL",
  hs_email_status: "SENT",
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

const created = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", { properties: emailProperties });
const emailId = created.id;
console.log("Email created:", emailId);

// Associate with contact
await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
);
console.log("Associated with contact");

// Associate with deal
await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
);
console.log("Associated with deal");

console.log("\nEmail draft logged successfully!");
