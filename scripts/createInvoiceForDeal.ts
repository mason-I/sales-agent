import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Line item IDs from the deal
    const lineItemIds = [
        "218387440093",
        "218572079597",
        "218572082645",
        "218584683995",
        "218584691190",
        "218586818016",
        "218592305632"
    ];

    // Build associations array for invoice creation
    // Format needed: { to: { id: "..." }, types: [{ associationCategory: "...", associationTypeId: ... }] }
    const associations = [];

    // Add line item associations (type 136 = invoice_to_line_item)
    for (const lineItemId of lineItemIds) {
        associations.push({
            to: { id: lineItemId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 136 }]
        });
    }

    // Add deal association (type 382 = invoice_to_deal)
    associations.push({
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 382 }]
    });

    const properties = {
        hs_currency: "USD",
        hs_invoice_status: "open"
    };

    console.log("Creating invoice with associations...");
    console.log("Number of line item associations:", lineItemIds.length);

    const invoice = await hubspotRequest("POST", "/crm/v3/objects/invoices", { properties, associations });

    console.log("\nInvoice created:");
    console.log(JSON.stringify(invoice, null, 2));
    console.log("\nInvoice ID:", invoice.id);
    console.log("Invoice Link:", invoice.properties?.hs_invoice_url || invoice.properties?.hs_invoice_link || "N/A");
}

main().catch(console.error);
