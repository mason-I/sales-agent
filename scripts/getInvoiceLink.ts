import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const invoiceId = "609433551343";

    // Get invoice with all properties
    const invoice = await hubspotRequest("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=*`);
    console.log("Invoice details:");
    console.log(JSON.stringify(invoice, null, 2));

    // Try to get the payments/checkout endpoint
    try {
        const checkout = await hubspotRequest("GET", `/crm/v3/objects/invoices/${invoiceId}/payment`);
        console.log("\nPayment info:");
        console.log(JSON.stringify(checkout, null, 2));
    } catch (e: any) {
        console.log("\nNo payment endpoint:", e.message);
    }
}

main().catch(console.error);
