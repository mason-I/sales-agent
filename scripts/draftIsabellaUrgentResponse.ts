#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.js";

const dealId = "231298784749";
const contactId = "281419516349";

// Email draft for Isabella - urgent vendor issue
const subject = "Re: Help needed - urgent";

const intro = `Hi Isabella,

Thanks for reaching out. I hear the urgency—when customers are frustrated and tickets are backing up, you need a solution that just works.

Yes, I can help. Zendesk is built for exactly this kind of situation, with fast setup and reliable performance out of the box. Most teams are up and running within days, not weeks.`;

const question = "So I can point you toward the right solution, what specific pain points are you experiencing with your current vendor—are they downtime issues, slow response times, or something else?";

const closing = `Talk soon,
Zendesk`;

// Build the email body
const questions = question ? [question] : [];
const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
const body = [intro, questionLines, closing].filter(Boolean).join("\n\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log("To: Isabella, COO at BlueRiver Consulting");
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

  // Update deal with initial pain discovery
  const dealUpdates = {
    sw_primary_pain: "Current vendor causing serious problems - customers frustrated, tickets piling up, recurring issues not being fixed"
  };

  await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: dealUpdates });
  console.log("Updated deal with captured info:", JSON.stringify(dealUpdates, null, 2));

  console.log("\nEmail draft logged and deal updated successfully!");
}

main().catch(console.error);
