#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "231034143191";

const subject = "Re: Scaling up on Zendesk";

// Email body - answer the scalability question, zero questions (nurture mode)
const intro = `Hi DeShawn,

Great question. Zendesk is designed to scale with you—starting small and growing isn't a migration situation, it's the same platform adapting to your needs.

Key points about scaling:
- **Same platform, more features**: You can start with a lightweight setup and add capabilities (automations, analytics, self-service, AI) as your team and volume grow.
- **Plan flexibility**: As you scale from 1-2 agents to a larger team, you can upgrade plans to unlock advanced workflows, reporting, and collaboration tools.
- **No data migration required**: Since you're already on Zendesk, scaling up means turning on more features—not moving your data anywhere.

Most logistics companies we work with start exactly where you are: one person managing inquiries, then adding team members as contract volume increases. The platform handles that transition smoothly.

[Source: https://www.zendesk.com/blog/migrate-help-desk-software/]`;

const question = ""; // Zero questions - nurture mode, let this info sink in

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
