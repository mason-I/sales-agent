import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Get invoice associations
    const assoc = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/invoices`);
    console.log("Invoice associations:", JSON.stringify(assoc, null, 2));

    const invoiceIds = assoc.results?.map((r: any) => r.toObjectId) || [];
    console.log("\nInvoice IDs:", invoiceIds);

    // Get details of first invoice if exists
    if (invoiceIds.length > 0) {
        const invoice = await hubspotRequest("GET", `/crm/v3/objects/invoices/${invoiceIds[0]}`);
        console.log("\nFirst invoice details:");
        console.log(JSON.stringify(invoice, null, 2));
    }
}

main().catch(console.error);
