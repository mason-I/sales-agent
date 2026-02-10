#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "231034143191";
// No contact ID known yet for DeShawn

const subject = "Re: Quick question about your services";

// Email body parts - 1 question to advance discovery
const intro = `Hi DeShawn,

Thanks for reaching out! Great to hear you're exploring options for Apex Logistics Solutions.

For logistics operations like yours, Zendesk provides:

- **Omnichannel support** – Email, messaging, live chat, social, and voice in one unified workspace
- **Self-service options** – AI-powered help centers and bots for 24/7 customer self-resolution
- **Automation & workflows** – Route and triage inquiries automatically so your team focuses on complex issues
- **Analytics & reporting** – Track response times, CSAT, and agent performance to identify improvement areas
- **Integrations** – Connect with your existing systems (logistics platforms, CRMs, etc.) via open APIs

We work with everyone from small teams just getting started to large operations handling millions of shipments. The platform scales with you.

[Sources: https://www.zendesk.com/industries/transportation/, https://www.zendesk.com/business/smb/]`;

const question = "What's prompting you to explore customer support options for next year? Any particular challenges with your current setup?";

const closing = `Best,

Zendesk`;

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
const body = [intro, questionLines, closing].filter(Boolean).join("\n\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log("Subject:", subject);
  console.log("\nBody:");
  console.log(body);
  console.log("\n===================\n");

  // Create the email engagement
  const emailProperties = {
    hs_email_direction: "EMAIL",
    hs_email_status: "SENT",
    hs_email_subject: subject,
    hs_email_text: body,
    hs_timestamp: new Date().toISOString()
  };

  const created = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", { properties: emailProperties });
  const emailId = created.id;

  if (!emailId) {
    throw new Error("Email creation failed (no ID returned)");
  }

  console.log("Created email ID:", emailId);

  // Associate with deal
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
  );
  console.log("Associated with deal:", dealId);

  console.log("\nEmail draft logged successfully!");
}

main().catch(console.error);
