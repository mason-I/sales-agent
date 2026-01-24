import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";
    const invoiceId = "609433551343";
    const invoiceUrl = `https://app-ap1.hubspot.com/contacts/442479746/objects/0-53?filters=%5B%7B%22property%22%3A%22hs_object_id%22%2C%22operator%22%3A%22EQ%22%2C%22value%22%3A%22${invoiceId}%22%7D%5D`;

    // Get the contact associated with this deal
    const contactAssoc = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts`);
    const contactId = contactAssoc.results?.[0]?.toObjectId;
    console.log("Contact ID:", contactId);

    // Create email draft
    const intro = `Thanks for confirming the invoice details. I've generated the invoice in HubSpot (Invoice ID: ${invoiceId}).

Your Zendesk Suite Growth plan for 25 agents at $2,225/month is now ready for payment.

The invoice has been created and will be sent to you shortly with a secure payment link. Once received, you can complete payment directly through that link.`;

    const closing = `Please let me know once you've received the payment link or if you have any questions.

I'll follow up to confirm once payment is complete.`;

    const subject = "Your Zendesk Invoice - Ready for Payment";
    const body = [intro, closing].filter(Boolean).join("\n\n") + "\n\nZendesk";

    const emailProperties = {
        hs_email_direction: "EMAIL",
        hs_email_status: "SENT",
        hs_email_subject: subject,
        hs_email_text: body,
        hs_timestamp: new Date().toISOString()
    };

    console.log("Creating email engagement...");
    const email = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
    const emailId = email.id;

    console.log("Email created:", emailId);

    // Associate to contact
    if (contactId) {
        await hubspotRequest(
            "PUT",
            `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
            [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
        );
        console.log("Associated to contact:", contactId);
    }

    // Associate to deal
    await hubspotRequest(
        "PUT",
        `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
        [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
    );
    console.log("Associated to deal:", dealId);

    console.log("\n--- EMAIL SENT ---");
    console.log("Subject:", subject);
    console.log("Invoice ID:", invoiceId);
    console.log("Invoice URL:", invoiceUrl);
}

main().catch(console.error);
