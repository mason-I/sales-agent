import { hubspotRequest } from "../src/lib/hubspot.ts";

// Log email draft to HubSpot for Kofi's initial inquiry response
const contactId = "284984592872";
const dealId = "234316403143";

const subject = "Re: Question about your platform";

const intro = `Hi Kofi,

Thanks for reaching out. NexusFlow is a unified customer support platform that helps teams streamline their operations across email, chat, phone, and social channels.

Key capabilities include:
- **Omnichannel support**: Handle customer inquiries from one workspace
- **Automation**: Self-service tools like ticket routing, macros, and AI-powered suggestions
- **Analytics**: Reporting on team performance, ticket trends, and customer satisfaction
- **Knowledge base**: Build a help center to empower customers to find answers on their own
- **Collaboration**: Internal notes, mentions, and shared ownership for complex issues

It's built to scale from small teams up through enterprise, with quick setup and fast time to value.`;

const questions: string[] = [
  "So I can focus on what would be most relevant, what challenge are you hoping to solve with a support platform right now"
];

const closing = `Thanks,
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
