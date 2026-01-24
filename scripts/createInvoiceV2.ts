import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Get actual line item IDs (not the association IDs)
    const lineItemAssoc = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/line_items`);
    const lineItemIds = lineItemAssoc.results?.map((r: any) => r.toObjectId) || [];

    console.log("Line item IDs:", lineItemIds);

    // Try creating the invoice with just deal association first
    const properties = {
        hs_currency: "USD",
        hs_invoice_status: "draft"  // Try draft status instead of open
    };

    const associations = [
        {
            to: { id: dealId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 382 }]
        }
    ];

    console.log("Creating invoice with deal association only...");
    const invoice = await hubspotRequest("POST", "/crm/v3/objects/invoices", { properties, associations });
    const invoiceId = invoice.id;

    console.log("Invoice created:", invoiceId);

    // Now try to associate line items one by one
    for (const lineItemId of lineItemIds) {
        try {
            await hubspotRequest(
                "POST",
                `/crm/v3/objects/invoices/${invoiceId}/associations/line_items/${lineItemId}`,
                {}
            );
            console.log(`Associated line item ${lineItemId}`);
        } catch (error: any) {
            console.error(`Failed to associate line item ${lineItemId}:`, error.message);
        }
    }

    // Update invoice to open status after adding line items
    await hubspotRequest("PATCH", `/crm/v3/objects/invoices/${invoiceId}`, {
        properties: { hs_invoice_status: "open" }
    });
    console.log("Invoice status updated to open");

    // Get invoice details
    const updatedInvoice = await hubspotRequest("GET", `/crm/v3/objects/invoices/${invoiceId}`);
    console.log("\nInvoice ID:", invoiceId);
    console.log("Invoice Link:", updatedInvoice.properties?.hs_invoice_url || updatedInvoice.properties?.hs_invoice_link || "N/A");
}

main().catch(console.error);
