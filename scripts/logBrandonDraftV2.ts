import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = '284991697401';
const dealId = '234318104000';
const subject = 'Re: Quick question';

const intro = "Hi Brandon,\n\nThanks for the context on your team size and channels - 20 agents with email and phone as primary is helpful to know.";
const questions = ["So I can point you toward the most relevant information, what's the main challenge you're hoping to solve by exploring new support platforms?"];
const closing = "No need to apologize for the response time - I completely understand expansion periods can be hectic. I'll keep my side of things concise.\n\nBest,\n\nZendesk";

const questionLines = questions.map((q, i) => `${i + 1}) ${q.endsWith('?') ? q : q + '?'}`).join("\n");
const body = [intro, questionLines, closing].filter(Boolean).join("\n\n");

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
