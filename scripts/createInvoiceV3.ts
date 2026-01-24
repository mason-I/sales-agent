import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Get actual line item IDs
    const lineItemAssoc = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/line_items`);
    const lineItemIds = lineItemAssoc.results?.map((r: any) => r.toObjectId) || [];

    console.log("Line item IDs:", lineItemIds);

    // Create invoice with NO associations first
    const properties = {
        hs_currency: "USD",
        hs_invoice_status: "draft"
    };

    console.log("Creating invoice without associations...");
    const invoice = await hubspotRequest("POST", "/crm/v3/objects/invoices", { properties });
    const invoiceId = invoice.id;

    console.log("Invoice created:", invoiceId);

    // Now associate line items one by one using v4 batch
    const inputs = lineItemIds.map((lineItemId: string) => ({
        from: { id: invoiceId },
        to: { id: lineItemId },
        type: "invoice_to_line_item"
    }));

    try {
        await hubspotRequest("POST", "/crm/v4/associations", { inputs });
        console.log("All line items associated successfully");
    } catch (error: any) {
        console.error("Batch association failed:", error.message);
        // Try v3 single associations
        for (const lineItemId of lineItemIds) {
            try {
                await hubspotRequest(
                    "PUT",
                    `/crm/v3/objects/invoices/${invoiceId}/associations/line_items/${lineItemId}/invoice_to_line_item`,
                    {}
                );
                console.log(`Associated line item ${lineItemId}`);
            } catch (e2: any) {
                console.error(`Failed to associate line item ${lineItemId}:`, e2.message);
            }
        }
    }

    // Associate deal
    try {
        await hubspotRequest(
            "PUT",
            `/crm/v3/objects/invoices/${invoiceId}/associations/deals/${dealId}/invoice_to_deal`,
            {}
        );
        console.log("Associated deal successfully");
    } catch (error: any) {
        console.error("Failed to associate deal:", error.message);
    }

    // Update to open
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
