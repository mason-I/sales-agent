import { hubspotRequest } from "../src/lib/hubspot";

async function logDraft() {
  const contactId = "285815828961";
  const dealId = "235044914644";

  const draft = {
    contactId,
    dealId,
    subject: "Re: Zendesk Pricing for 25 Agents",
    bodyParts: {
      intro: "Thanks for reaching out, Theresa. I'd be happy to help with pricing for your team of 25 agents.",
      questions: [
        "So I can provide accurate Professional tier pricing, which support channels does your team need (email, chat, phone, social messaging, or a combination)?"
      ],
      closing: "Good to hear you're planning for Q2—that gives us plenty of time to get you set up smoothly."
    }
  };

  // Build full email body
  const body = [
    draft.bodyParts.intro,
    "",
    ...draft.bodyParts.questions,
    "",
    draft.bodyParts.closing,
    "",
    "Thanks,",
    "Zendesk"
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
