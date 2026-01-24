import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const invoiceId = "609433551343";

    // Try to create a payment via the commerce/payments API
    const paymentProperties = {
        hs_status: "pending",
        hs_amount: "2225.00",
        hs_currency: "USD"
    };

    try {
        const payment = await hubspotRequest("POST", "/crm/v3/objects/payments", {
            properties: paymentProperties,
            associations: [
                {
                    to: { id: invoiceId },
                    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 228 }]
                }
            ]
        });
        console.log("Payment created:");
        console.log(JSON.stringify(payment, null, 2));
    } catch (error: any) {
        console.error("Failed to create payment:", error.message);
    }

    // Check if there's a public URL endpoint for the invoice
    try {
        const publicUrl = await hubspotRequest("POST", `/crm/v3/objects/invoices/${invoiceId}/public-url`);
        console.log("\nPublic URL:");
        console.log(JSON.stringify(publicUrl, null, 2));
    } catch (e: any) {
        console.error("\nFailed to get public URL:", e.message);
    }
}

main().catch(console.error);
