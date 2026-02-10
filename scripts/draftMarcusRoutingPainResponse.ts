import { hubspotRequest } from "../src/lib/hubspot";

async function logMarcusRoutingPainResponse() {
  const contactId = "282018485697";
  const dealId = "230850084322";

  const intro = "Thanks for sharing that context. Ticket organization and routing—things falling through the cracks and inconsistent response times—is exactly the kind of problem Zendesk is built to solve. Our routing options automatically assign tickets to the right agent based on rules you set, so nothing gets missed and response times become consistent. Learn more about our routing framework here: https://support.zendesk.com/hc/en-us/articles/4408831658650";

  const questions = [
    "So I can recommend the right setup, what support channels do you need to cover (email, chat, phone, social, etc.)?",
    "Roughly how many support requests are you handling per month?"
  ];

  const closing = "Once I understand your volume and channels, I can confirm whether the Support Team plan at $152/month fits your needs.";

  const normalizedQuestions = questions.slice(0, 3).map((q) => (q.endsWith("?") ? q : `${q}?`));
  const questionLines = normalizedQuestions.map((q, i) => `${i + 1}) ${q}`).join("\n");

  let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
  if (!/zendesk/i.test(body)) {
    body = `${body}\n\nZendesk`;
  }

  const subject = "Re: Quick question";

  const emailProperties = {
    hs_email_direction: "EMAIL",
    hs_email_status: "SENT",
    hs_email_subject: subject,
    hs_email_text: body,
    hs_timestamp: new Date().toISOString()
  };

  console.log("=== EMAIL DRAFT ===");
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${body}`);
  console.log("===================\n");

  // Create email
  const created = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", { properties: emailProperties });
  const emailId = created.id;
  console.log(`Created email ID: ${emailId}`);

  // Associate with contact
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );
  console.log(`Associated with contact: ${contactId}`);

  // Associate with deal
  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
  );
  console.log(`Associated with deal: ${dealId}`);

  console.log("\nEmail draft logged successfully!");
}

logMarcusRoutingPainResponse().catch(console.error);
