import { hubspotRequest, fetchDealProperties, fetchDealAssociations } from "../src/lib/hubspot";

const dealId = "230848380391";

async function draftYasminResponse() {
  // First get the deal
  const deal = await fetchDealProperties(dealId, ["dealname", "dealstage"]);
  console.log("Deal:", deal);

  // Get associated contacts
  const associations = await fetchDealAssociations(dealId, "contact");
  console.log("Associations:", associations);

  const contactId = associations[0]?.toObjectId;

  if (!contactId) {
    console.error("No contact associated with deal");
    return;
  }

  // Build the email draft
  const intro = "Thanks for reaching out! I appreciate you being upfront about budget - that actually helps me point you in the right direction.\n\nZendesk Suite pricing starts at $55/agent/month for our Team tier, with Growth at $89/agent/month and Professional at $115/agent/month. Each tier builds on the last with more automation and reporting capabilities.";

  const questions = [
    "So I can give you an accurate estimate, roughly how many agents would need access?"
  ];

  const closing = "If you're at the smaller end, our Team tier at $55/agent/month is often a great fit for teams getting started with modern support.\n\nThanks,";

  // Build the full email body
  const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
  let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
  if (!/zendesk/i.test(body)) {
    body = `${body}\n\nZendesk`;
  }

  const subject = "Re: Quick question";

  console.log("Email body:");
  console.log(body);
  console.log("\n---\n");

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
  console.log("Contact ID:", contactId);
  console.log("Deal ID:", dealId);
  console.log("Email ID:", emailId);
}

draftYasminResponse().catch(console.error);
