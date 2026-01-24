#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "222852280814";
const contactId = "273316909510";

const subject = "Re: Quick question";

// Email body parts - 0-1 questions max (SMB-focused, async-only)
const intro = "Hi Riley, thanks for reaching out! I'd be happy to help you learn more about Zendesk.";
const question = "So I can point you to the most relevant information, what prompted you to explore a new support platform?";
const closing = "Looking forward to learning more about your needs.";

// Build the email body
const questions = question ? [`1) ${question.endsWith("?") ? question : question + "?"}`] : [];
const questionLines = questions.join("\n");
const body = [intro, questionLines, closing, "Zendesk"].filter(Boolean).join("\n\n");

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

  console.log("\n✅ Email draft logged successfully!");
}

main().catch(console.error);
