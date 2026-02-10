#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230844423662";
const contactId = "281283770868";

const subject = "Re: Quick question";

// Email body parts - 0-1 questions max (SMB-focused, async-only)
const intro = "Thanks for sharing those details, Eduardo. That really helps me understand what you're up against with peak hour volume and those slipping tickets.";
const aiAnswer = "Regarding AI for routine inquiries—Zendesk AI agents are pre-trained on billions of real customer service interactions, so they can handle common requests from day one. They're designed to automate up to 80% of customer interactions, handling entire conversations from start to finish. This frees your team to focus on complex issues while the AI takes things like order status, product details, returns, and account questions.";
const question = "So I can share the right path forward, what's your target timeline for making a change?";
const closing = "Thanks,";

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.join("\n");
const body = [intro, aiAnswer, questionLines, closing, "Zendesk"].filter(Boolean).join("\n\n");

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

  // Update deal with primary pain point
  await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
    properties: {
      sw_primary_pain: "Peak hour ticket volume overwhelming 20 agents; response times degrading; tickets falling through cracks",
      agents_required: "20"
    }
  });
  console.log("Updated deal with pain point and agent count");

  console.log("\nEmail draft logged successfully!");
}

main().catch(console.error);
