import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231026931162";
const lineItemId = "227141320123";

// Step 1: Create invoice in DRAFT status (no validation on associations)
const properties = {
    hs_currency: "USD",
    hs_invoice_status: "draft"
};

console.log("Creating invoice in draft status...");
const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", { properties });
const invoiceId = invoice.id;
console.log("Invoice created:", invoiceId);

// Step 2: Associate line item using v3 with association type name
try {
    await hubspotRequest(
        "PUT",
        `/crm/v3/objects/invoices/${invoiceId}/associations/line_items/${lineItemId}/invoice_to_line_item`,
        {}
    );
    console.log("Associated line item successfully");
} catch (e: any) {
    console.error("Failed to associate line item:", e.message);
}

// Step 3: Associate deal
try {
    await hubspotRequest(
        "PUT",
        `/crm/v3/objects/invoices/${invoiceId}/associations/deals/${dealId}/invoice_to_deal`,
        {}
    );
    console.log("Associated deal successfully");
} catch (e: any) {
    console.error("Failed to associate deal:", e.message);
}

// Step 4: Update to open status
await hubspotRequest("PATCH", `/crm/v3/objects/invoices/${invoiceId}`, {
    properties: { hs_invoice_status: "open" }
});
console.log("Invoice status updated to open");

// Get invoice details
const updatedInvoice = await hubspotRequest<any>("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=hs_invoice_url,hs_invoice_link`);
const invoiceLink = updatedInvoice.properties?.hs_invoice_url || updatedInvoice.properties?.hs_invoice_link || "";
console.log("\nInvoice ID:", invoiceId);
console.log("Invoice Link:", invoiceLink || "No link available");
