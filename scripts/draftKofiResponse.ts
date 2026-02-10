import { hubspotRequest } from "../src/lib/hubspot.ts";

// Log email draft to HubSpot
const contactId = "281758786005";
const dealId = "230905673157";

const subject = "Re: Quick question - Pricing & Implementation Timeline";

const intro = `Hi Kofi,

Thanks for reaching out. I completely understand the urgency—piling tickets and customer complaints need immediate attention.

Zendesk Suite pricing starts at $55 per agent/month for our Team tier, with Growth at $89 and Professional at $115. All tiers include email, help center, and messaging support out of the box.

Implementation is fast—most teams are up and running within days to a couple of weeks, depending on data migration needs. Given your timeline, we can definitely move quickly.`;

const questions = [
  "So I can recommend the right plan for Meridian Logistics, how many agents will need access?"
];

const closing = `I'll put together a tailored quote once I know your team size.

Thanks,
Zendesk`;

// Build email body
const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
const body = [intro, questionLines, closing].filter(Boolean).join("\n\n");

const emailProperties = {
  hs_email_direction: "EMAIL",
  hs_email_status: "SENT",
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

const created = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
const emailId = created.id;
console.log("Created email:", emailId);

// Associate to contact
await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
);

// Associate to deal
await hubspotRequest(
  "PUT",
  `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
);

console.log("Email logged and associated successfully");
