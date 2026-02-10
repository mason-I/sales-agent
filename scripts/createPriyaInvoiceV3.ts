import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298774497";
const lineItemId = "226987137506";

// Try creating invoice with lineItems array format
const invoiceBody = {
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

console.log("Creating invoice with lineItems array...");
try {
  const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", invoiceBody);
  const invoiceId = invoice.id;
  console.log("Created invoice:", invoiceId);

  const updatedInvoice = await hubspotRequest<any>("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=hs_invoice_url,hs_invoice_link`);
  const invoiceLink = updatedInvoice.properties?.hs_invoice_url || updatedInvoice.properties?.hs_invoice_link || "";
  console.log("Invoice link:", invoiceLink || "No link");
} catch (e: any) {
  console.error("Failed:", e.message);

  // Try alternate format - create invoice with both associations in one go
  // Using the format from HubSpot docs
  const altBody = {
    properties: {
      hs_currency: "USD",
      hs_invoice_status: "draft"  // Try draft first
    },
    associations: [
      {
        to: { id: lineItemId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 200 }]
      },
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 382 }]
      }
    ]
  };

  console.log("Trying draft status with association type 200...");
  const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", altBody);
  console.log("Created invoice:", invoice.id);
}
