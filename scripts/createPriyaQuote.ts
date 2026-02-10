import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298774497";
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

// Create invoice (as quote)
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

const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", invoiceBody);
const invoiceId = invoice.id;
const invoiceLink = invoice.properties?.hs_invoice_url || invoice.properties?.hs_invoice_link || "";

console.log("Created invoice:", invoiceId);
console.log("Invoice link:", invoiceLink || "No link");
