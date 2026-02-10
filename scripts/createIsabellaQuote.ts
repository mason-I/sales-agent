import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298784749";
const sku = "ZD-SUITE-PROFESSIONAL";
const quantity = 50;

// Find product by SKU
const productBody = {
  filterGroups: [
    {
      filters: [
        {
          propertyName: "hs_sku",
          operator: "EQ",
          value: sku
        }
      ]
    }
  ],
  properties: ["name", "price", "hs_sku"],
  limit: 1
};

const productResult = await hubspotRequest<any>("POST", "/crm/v3/objects/products/search", productBody);
const product = productResult.results?.[0];

if (!product) {
  console.error("Product not found:", sku);
  Deno.exit(1);
}

console.log("Found product:", product.properties?.name, "Price:", product.properties?.price);

// Create line item
const lineItemBody = {
  properties: {
    name: product.properties?.name || sku,
    quantity: String(quantity),
    price: product.properties?.price || "115",
    hs_product_id: product.id
  }
};

const lineItem = await hubspotRequest<any>("POST", "/crm/v3/objects/line_items", lineItemBody);
const lineItemId = lineItem.id;
console.log("Created line item:", lineItemId);

// Associate line item to deal
await hubspotRequest(
  "PUT",
  `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`,
  [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 20 }]
);
console.log("Associated line item to deal");

// Create invoice (as quote) - using associations array properly
const invoiceBody = {
  properties: {
    hs_currency: "USD",
    hs_invoice_status: "open"
  },
  associations: [
    {
      to: { id: lineItemId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 176 }] // INVOICE_TO_LINE_ITEM = 176
    },
    {
      to: { id: dealId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 382 }] // INVOICE_TO_DEAL = 382
    }
  ]
};

const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", invoiceBody);
const invoiceId = invoice.id;

// Fetch the invoice with the URL property
const invoiceWithUrl = await hubspotRequest<any>("GET", `/crm/v3/objects/invoices/${invoiceId}?properties=hs_invoice_url,hs_invoice_link`);
const invoiceLink = invoiceWithUrl.properties?.hs_invoice_url || invoiceWithUrl.properties?.hs_invoice_link || "";

console.log("Created invoice:", invoiceId);
console.log("Invoice link:", invoiceLink || "No link");
