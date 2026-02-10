import { hubspotRequest } from "../src/lib/hubspot.ts";

// Log email draft to HubSpot
const contactId = "281758786005";
const dealId = "230905673157";

const subject = "Re: Customer support solutions";

const intro = `Thanks.

Will do.`;

const questions: string[] = [];

const closing = `Kofi`;

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
