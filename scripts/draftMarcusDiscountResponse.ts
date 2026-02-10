#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230850084322";

const subject = "Re: Quick question";

// Email body parts - 0-1 questions max (SMB-focused, async-only)
const intro = "Hi Marcus,\\n\\nThanks for the quick response—and good to know you're working with 8 agents. At $19/agent/month, you're looking at the most cost-effective tier we offer. The Support Team plan is designed specifically for smaller teams like yours, so while we don't offer additional discounts, this pricing is already optimized for lean budgets.";
const question = "What's the main challenge you're trying to solve with your support operations right now?";
const closing = "Best,";

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\\n");
const body = [intro, questionLines, closing, "Zendesk"].filter(Boolean).join("\\n\\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log("Subject:", subject);
  console.log("\\nBody:");
  console.log(body);
  console.log("\\n===================\\n");

  // Fetch contact from deal associations
  const deal = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname&associations=contacts`);
  const contactId = deal.associations?.contacts?.results?.[0]?.id;

  if (!contactId) {
    throw new Error("No contact associated with deal");
  }
  console.log("Found contact ID:", contactId);

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

  console.log("\\nEmail draft logged successfully!");
}

main().catch(console.error);
