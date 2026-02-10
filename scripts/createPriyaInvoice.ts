import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298774497";
const lineItemId = "226987137506"; // Already created

// Create invoice with correct association format
const invoiceBody = {
  properties: {
    hs_currency: "USD",
    hs_invoice_status: "open"
  },
  associations: [
    {
      to: { id: lineItemId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 136 }]
    },
    {
      to: { id: dealId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 382 }]
    }
  ]
};

// Try alternate format
const alternateBody = {
  properties: {
    hs_currency: "USD",
    hs_invoice_status: "open"
  },
  "lineItems": [
    {
      "id": lineItemId
    }
  ]
};

console.log("Creating invoice...");
const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", invoiceBody);
const invoiceId = invoice.id;
const invoiceLink = invoice.properties?.hs_invoice_url || invoice.properties?.hs_invoice_link || "";

console.log("Created invoice:", invoiceId);
console.log("Invoice link:", invoiceLink || "No link");
