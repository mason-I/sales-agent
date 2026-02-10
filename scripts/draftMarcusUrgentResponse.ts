#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.js";

const dealId = "231034132924";
const contactId = "281473622483";

// Email draft for Marcus Chen - urgent pricing + timeline question
const subject = "Re: Urgent: Need to switch from our current vendor ASAP";

const intro = `Hi Marcus,

Thanks for reaching out—I hear the urgency, and I want to help you get this resolved quickly.

On pricing, Zendesk Suite Team starts at $55 per agent/month when billed annually. For 50+ agents, the Growth tier ($89/agent/month) or Professional tier ($115/agent/month) may be a better fit—both include more advanced automation and reporting that could help you get on top of those piled-up tickets faster.

On timeline, most teams are up and running within a few days to a couple of weeks depending on complexity. We offer guided onboarding and can prioritize your implementation given the situation.`;

const question = "So I can point you toward the right tier and a rough quote, what support channels do your customers use most—email, chat, phone, or a mix?";

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

  // Update deal with captured information
  // Calculate timestamp for 1 week from now at midnight UTC
  const oneWeekFromNow = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
  const midnightTimestamp = Date.UTC(
    oneWeekFromNow.getUTCFullYear(),
    oneWeekFromNow.getUTCMonth(),
    oneWeekFromNow.getUTCDate() + 1, // Next day at midnight
    0, 0, 0, 0
  );

  const dealUpdates = {
    sw_primary_pain: "Current vendor solution failing—causing support tickets and customer complaints to pile up",
    key_challenges: "Vendor failure leading to ticket backlog and customer complaints",
    agents_required: "50",
    timeline_for_change: String(midnightTimestamp)
  };

  await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: dealUpdates });
  console.log("Updated deal with captured info:", JSON.stringify(dealUpdates, null, 2));

  console.log("\nEmail draft logged and deal updated successfully!");
}

main().catch(console.error);
