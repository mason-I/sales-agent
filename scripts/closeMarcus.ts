#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "231033928160";
// Will fetch contact from deal associations

const subject = "Re: Quick question";

// Email body parts - closing email (0 questions, askStyle=close)
const intro = "Thanks for taking the time to explore Zendesk, Marcus. I'll keep the door open if you'd like to reconnect when you're ready to dive deeper.";
const closing = "Best of luck with your evaluation.\n\nZendesk";

// Build the email body
const body = [intro, closing].filter(Boolean).join("\n\n");

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
