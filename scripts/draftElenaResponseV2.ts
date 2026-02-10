import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot";

const dealId = "230905683390";

async function draftElenaResponse() {
  // Get associated contacts
  const associations = await fetchDealAssociations(dealId, "contact");
  const contactId = associations[0]?.toObjectId;

  if (!contactId) {
    console.error("No contact associated with deal");
    return;
  }

  console.log("Contact ID:", contactId);
  console.log("Deal ID:", dealId);

  // Build the email draft
  const intro = "Thanks for sharing those details about your challenges with scattered inquiries and inconsistent response times. That context helps a lot.";

  const questions = [
    "So I can get you a formal quote and help you plan the rollout, when are you hoping to have a new support platform in place?"
  ];

  const closing = "Great news on the budget — at $152/month ($1,824 annually for 8 agents), you're well under your $5,000 target. Regarding startup discounts: we don't offer additional discounts beyond our standard pricing, but the Support Team tier is already designed as our most affordable entry point and will give you a unified inbox to consolidate those email and social media inquiries.";

  // Build the full email body
  let questionText = "";
  questions.forEach((q, index) => {
    questionText += (index + 1) + ") " + q + "\n";
  });

  let body = [intro, questionText.trim(), closing].filter(Boolean).join("\n\n");
  if (!/zendesk/i.test(body)) {
    body = body + "\n\nZendesk";
  }

  const subject = "Re: Quick question";

  console.log("\n--- Email Draft ---");
  console.log("Subject:", subject);
  console.log(body);
  console.log("---\n");

  // Create the email in HubSpot
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
    console.error("Email creation failed");
    return;
  }

  console.log("Created email ID:", emailId);

  // Associate email with contact
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );

  // Associate email with deal
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
  );

  console.log("Email logged and associated successfully");
}

draftElenaResponse().catch(console.error);
