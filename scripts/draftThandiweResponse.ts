import { hubspotRequest } from "../src/lib/hubspot.js";

async function logDraft() {
  const contactId = "286931683774";
  const dealId = "236371713508";

  const draft = {
    contactId,
    dealId,
    subject: "Re: Quick question",
    bodyParts: {
      intro: "Hi Thandiwe,\n\nThanks for reaching out. Zendesk is a customer service platform that brings all your support channels—email, chat, phone, social messaging—into one workspace. Teams can track, prioritize, and resolve customer requests efficiently, with built-in reporting and a self-service help center to deflect common questions.",
      questions: [
        "So I can point you to the most relevant information, what prompted your search for a new support solution?"
      ],
      closing: "Thanks,\n\nZendesk"
    }
  };

  // Build full email body
  const body = [
    draft.bodyParts.intro,
    "",
    ...draft.bodyParts.questions,
    "",
    draft.bodyParts.closing
  ].join("\n");

  // Log as email engagement
  const payload = {
    properties: {
      hs_email_direction: "EMAIL",
      hs_email_status: "SENT",
      hs_email_subject: draft.subject,
      hs_email_text: body,
      hs_timestamp: new Date().toISOString(),
      hs_email_headers: JSON.stringify({
        from: { email: "sales@zendesk.com", firstName: "", lastName: "" },
        to: [{ email: "" }]
      })
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
      },
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
      }
    ]
  };

  const result = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", payload);
  console.log("Email draft logged:", JSON.stringify(result, null, 2));
  console.log("\n--- Email Draft ---");
  console.log(`Subject: ${draft.subject}`);
  console.log(body);
}

logDraft().catch(console.error);
