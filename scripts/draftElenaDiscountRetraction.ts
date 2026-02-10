import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot";

const dealId = "230905683390";

async function draftElenaRetraction() {
  // Get associated contacts
  const associations = await fetchDealAssociations(dealId, "contact");
  const contactId = associations[0]?.toObjectId;

  if (!contactId) {
    console.error("No contact associated with deal");
    return;
  }

  console.log("Contact ID:", contactId);
  console.log("Deal ID:", dealId);

  // Build the email draft - retracts erroneous 5% discount and clarifies actual pricing
  const intro = "I need to clarify—I apologize for the confusion in my previous message. The pricing I referenced was incorrect.\n\nThe Suite Team tier is $5,184/year for 8 agents, and this is the standard annual price with no flexibility for discounts. I should not have mentioned a reduced rate.\n\nGiven your $5,000 budget, you have two paths forward:\n\n1. **Suite Team at $5,184/year** – Covers email + social media consolidation, which you noted is a priority given your DM volume.\n\n2. **Support Team at $1,824/year** – Email only, well under budget. You could add social messaging channels later when budget allows.";

  const questions = [] as string[];

  const closing = "I realize the $184 overage on Suite Team may require you to revisit the budget with your team. Either way, I'm happy to proceed with whichever option works for Pinnacle Industries.";

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

draftElenaRetraction().catch(console.error);
