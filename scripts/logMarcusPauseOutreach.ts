import { hubspotRequest } from '../src/lib/hubspot.ts';

const contactId = '282018485697';
const dealId = '230848423416';
const subject = 'Re: Question';

const intro = "Hi Marcus,\n\nThanks for the update. I'll pause outreach here—no need to reply.";
const questions: string[] = [];
const closing = "When you're ready to explore options for your support platform, feel free to reach out and I'll be happy to help.";

const body = [intro, ...questions, closing].filter(Boolean).join("\n\n") + "\n\nZendesk";

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

console.log("\n---");
console.log("Subject:", subject);
console.log("Body:", body);
console.log("\nEmail draft logged successfully!");
console.log("Email ID:", emailId);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
