#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "281991124468";
const dealId = "231026996678";
const subject = "Re: API Capabilities and Integration Options - Apex Logistics";

const intro = `Thanks for the follow-up questions. Let me address each with specifics:

**Webhook Payload**: The ticket object in webhook payloads includes core attributes (id, status, priority, assignee_id, requester_id, tags, custom fields, etc.) but NOT full comment history. For comment details, you'd use the comment_id returned in the payload to make a follow-up API call. Custom fields are included in the ticket object.

**Concurrent Requests**: No hard concurrent request limit, but bulk endpoints queue background jobs with a maximum of 30 queued or running jobs at once. Exceeding this returns a "TooManyJobs" error. Recommended: monitor the \`ratelimit-remaining\` response header and implement exponential backoff using the \`Retry-After\` header on 429 responses.

**Enterprise Rate Limits** (specifics from our rate limit documentation):
- Professional: 400 requests/minute
- Enterprise: 700 requests/minute
- Enterprise Plus: 2,500 requests/minute (High Volume API add-on included)
- High Volume API add-on: Raises limit to 2,500 req/min on qualifying plans (Growth+ and Professional+, requires 10+ agent seats)
- Beyond 2,500: Available with Zendesk's prior written consent for an additional fee`;

const questions: string[] = [
  "So I can confirm the rate limits will support your scale, roughly how many ticket creation operations are you anticipating per day during peak periods?"
];

const closing = `Let me know if you need anything else to complete your evaluation.

Thanks`;

const body = [intro, ...questions, closing, "Zendesk"].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

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
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
