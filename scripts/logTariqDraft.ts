import { hubspotRequest } from "../src/lib/hubspot.ts";

async function main() {
  const contactId = "281529343460";
  const dealId = "231256454623";
  const subject = "Re: Quick question";

  const intro = `Hi Tariq,

Great question—I want to make sure you have the full picture.

**Startup & Annual Options:**
- Annual billing does include a discount (effectively ~2 months free)
- For startups and teams just getting started, we do have flexible onboarding paths that can help you scale into the full feature set over time

**For 8 agents specifically**, the Team tier would be the fit, and I'd be happy to put together a custom quote that reflects any applicable incentives.

That said, I want to make sure this is the right solution for your specific situation.`;

  const questions = [
    "What's the main challenge you're trying to solve right now—are you looking to scale support, improve response times, or something else?"
  ];

  const closing = `Thanks,
Zendesk`;

  const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join("\n");
  const body = [intro, questionLines, closing].filter(Boolean).join("\n\n");

  console.log("Email body:");
  console.log(body);
  console.log("\n--- Logging to HubSpot ---\n");

  const emailProperties = {
    hs_email_direction: "EMAIL",
    hs_email_status: "SENT",
    hs_email_subject: subject,
    hs_email_text: body,
    hs_timestamp: new Date().toISOString()
  };

  const created = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", { properties: emailProperties });
  const emailId = created.id;
  console.log("Created email ID:", emailId);

  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );
  console.log("Associated to contact:", contactId);

  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
  );
  console.log("Associated to deal:", dealId);
  console.log("\nDone!");
}

main().catch(console.error);
