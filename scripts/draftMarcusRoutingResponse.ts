import { hubspotRequest } from "../src/lib/hubspot";

async function logMarcusRoutingResponse() {
  const contactId = "281292042709";
  const dealId = "231483721201";

  const intro = "Thanks for reaching out, Marcus. Great to hear you're evaluating support automation options for Chen Logistics.";

  const questions = [
    "So I can recommend the right plan for your team, what's driving your exploration of automation right now—is it a specific challenge with handoffs, response times, or something else?"
  ];

  const closing = `On routing: Zendesk provides omnichannel routing that automatically directs requests across email, chat, phone, social, and messaging apps based on agent availability, skills, capacity, and ticket priority. This includes skills-based routing, agent status and capacity management, conversation prioritization, and AI-powered intelligent routing that uses customer intent and sentiment. Learn more: https://www.zendesk.com/blog/omnichannel-routing/

On pricing: For roughly 25 agents, Zendesk Suite starts at $55/agent/month for Team (includes omnichannel routing). Growth at $89/agent/month and Professional at $115/agent/month add advanced skills-based routing, agent capacity management, and AI-powered intelligent routing.`;

  const normalizedQuestions = questions.slice(0, 3).map((q) => (q.endsWith("?") ? q : `${q}?`));
  const questionLines = normalizedQuestions.map((q, i) => `${i + 1}) ${q}`).join("\n");

  let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
  if (!/zendesk/i.test(body)) {
    body = `${body}\n\nZendesk`;
  }

  const subject = "Re: Quick question - Routing capabilities and pricing";

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

logMarcusRoutingResponse().catch(console.error);
