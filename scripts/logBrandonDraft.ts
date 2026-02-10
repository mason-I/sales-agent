import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = '284991697401';
const dealId = '234318104000';
const subject = 'Re: Quick question about your platform';

const intro = "Hi Brandon,\n\nThanks for reaching out—glad you found us. Happy to share some details about what we do.";
const questions = ["To make sure I point you toward the most relevant information, could you share a bit about what your support team looks like today? Specifically: how many agents do you have, and what channels are you supporting customers through (email, chat, phone, social messaging, etc.)?"];
const closing = "Once I understand your setup a bit better, I can send over some targeted resources that fit your situation. No rush—I know things get busy.\n\nBest,\nBrandon";

const questionLines = questions.map((q, i) => `${i + 1}) ${q.endsWith('?') ? q : q + '?'}`).join("\n");
const body = [intro, questionLines, closing].filter(Boolean).join("\n\n") + "\n\nZendesk";

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
