#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230842602978";
const contactId = ""; // Will fetch from deal

const subject = "Re: Question - Zendesk Support Solutions";

// Email body parts - 0-1 questions max (SMB-focused, async-only)
const intro = "Thanks for reaching out, Marcus. Happy to walk you through what we offer.";
const overview = "Zendesk is a complete customer service platform that brings all your support channels into one place. Your team can handle customer inquiries over email, chat, phone, social messaging, and even a self-service help center—all from a single unified workspace.";
const valueProps = "Key capabilities include:\n- A shared inbox so no customer question falls through the cracks\n- Automated workflows to route tickets to the right team\n- Self-service tools so customers can find answers on their own (reducing your ticket volume)\n- Reporting dashboards to track team performance and customer satisfaction";
const question = "So I can point you to the most relevant information, what support channels are you using today, and roughly how many agents are on your team?";
const closing = "Best,";

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.join("\n");
const body = [intro, overview, valueProps, questionLines, closing, "Zendesk"].filter(Boolean).join("\n\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log("Subject:", subject);
  console.log("\nBody:");
  console.log(body);
  console.log("\n===================\n");

  // Fetch contact from deal associations
  const deal = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname&associations=contacts`);
  const fetchedContactId = deal.associations?.contacts?.results?.[0]?.id;

  if (!fetchedContactId) {
    throw new Error("No contact associated with deal");
  }
  console.log("Found contact ID:", fetchedContactId);

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
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${fetchedContactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );
  console.log("Associated with contact:", fetchedContactId);

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
