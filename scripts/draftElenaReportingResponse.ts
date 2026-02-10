#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "282235318752";
const dealId = "231607878084";
const subject = "Re: Quick question - Support Team reporting";

const intro = `Great question, Elena. The Support Team plan includes core reporting capabilities:`;

const questions: string[] = [
  "Do these built-in reporting features cover what your team needs, or would you like me to walk through what's available at the Professional tier?"
];

const closing = `**Reporting included in Support Team:**
- Overview dashboard for at-a-glance metrics
- Zendesk Benchmark to compare your performance against similar companies
- Prebuilt analytics dashboards
- Data exports for offline analysis

These give you solid visibility into ticket volume, agent activity, and key support metrics. For deeper, customizable reporting and ad-hoc data exploration, you'd need to upgrade to Support Professional—but many teams find Team's built-in reporting sufficient when they're getting started.`;

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
