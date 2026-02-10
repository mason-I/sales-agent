import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298774497";
const lineItemId = "226987137506"; // Already created

// First create invoice without associations
const invoiceBody = {
  properties: {
    hs_currency: "USD",
    hs_invoice_status: "open"
  }
};

console.log("Creating invoice...");
const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", invoiceBody);
const invoiceId = invoice.id;
console.log("Created invoice:", invoiceId);

// Now associate line item to invoice using v4 associations endpoint
// Type 200 is INVOICE_TO_LINE_ITEM based on HubSpot docs
const associateBody = [
  {
    "associationCategory": "HUBSPOT_DEFINED",
    "associationTypeId": 200
  }
];

await hubspotRequest(
  "PUT",
  `/crm/v4/objects/invoices/${invoiceId}/associations/line_items/${lineItemId}`,
  associateBody
);
console.log("Associated line item to invoice");

// Associate invoice to deal (type 382 is DEAL_TO_INVOICE)
const associateDealBody = [
  {
    "associationCategory": "HUBSPOT_DEFINED",
    "associationTypeId": 382
  }
];

await hubspotRequest(
  "PUT",
  `/crm/v4/objects/invoices/${invoiceId}/associations/deals/${dealId}`,
  associateDealBody
);
console.log("Associated invoice to deal");

// Get updated invoice with link
const updatedInvoice = await hubspotRequest<any>("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=hs_invoice_url,hs_invoice_link`);
const invoiceLink = updatedInvoice.properties?.hs_invoice_url || updatedInvoice.properties?.hs_invoice_link || "";

console.log("Invoice link:", invoiceLink || "No link");
