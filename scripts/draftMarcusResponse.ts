#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230905436665";
const contactId = ""; // Will fetch from deal

const subject = "Re: Quick question about your platform";

// Email body parts - 0-1 questions max (SMB-focused, async-only)
const intro = "Thanks for reaching out, Marcus. Great to hear you're evaluating options for PulseFlow Analytics.";
const schedulingAnswer = "On **agent scheduling**, Zendesk offers built-in workforce management with AI-powered forecasting, shift scheduling tools, and real-time coverage dashboards. Unlike competitors that require third-party integrations for WFM, Zendesk handles staffing predictions, shift assignments, and workload management all in one platform. This helps prevent over- or under-staffing before it impacts your customers.";
const reportingAnswer = "For **reporting and analytics**, you get customizable dashboards with prebuilt CX KPIs (CSAT, response time, ticket volume, agent performance), advanced filtering, and trend analysis. While some tools focus primarily on voice metrics or basic agent stats, Zendesk provides visibility across all channels—chat, email, social, and voice—in a unified workspace.";
const question = "What specific scheduling or reporting challenges are you hoping to solve with this change?";
const closing = "Best,";

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.join("\n");
const body = [intro, schedulingAnswer, reportingAnswer, questionLines, closing, "Zendesk"].filter(Boolean).join("\n\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log("Subject:", subject);
  console.log("\nBody:");
  console.log(body);
  console.log("\n===================\n");

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

  console.log("\nEmail draft logged successfully!");
}

main().catch(console.error);
