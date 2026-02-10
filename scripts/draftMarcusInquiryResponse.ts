#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230842602978";
const contactId = "281526737369";

const subject = "Re: Quick question";

// Email body parts - 1 question to advance discovery
const intro = `Hi Marcus,

Thanks for reaching out. Zendesk offers a complete customer service platform built to help teams deliver great support efficiently. Here's a quick overview:

**Support** – Our core help desk that unifies customer conversations across email, chat, phone, and social media into one workspace.

**Guide** – A knowledge base that lets customers find answers on their own, reducing ticket volume.

**Messaging** – Embedded chat and messaging for your website or app.

**Talk** – Cloud call center software integrated right into your support workflow.

Everything is quick to set up and works together out of the box.`;

const question = "So I can point you toward the right solution, what does your current support setup look like, and what are you hoping to improve?";

const closing = `Thanks,

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

  // Associate with contact
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );
  console.log("Associated with contact:", contactId);

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
