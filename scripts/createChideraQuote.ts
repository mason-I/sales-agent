#!/usr/bin/env bun
import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

const DEAL_ID = "231116506565";

// Team tier for 20 agents
const LINE_ITEMS = [
  { sku: "ZD-SUITE-TEAM", quantity: 20 }
];

async function findProductBySku(sku: string) {
  const body = {
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

  const result = await hubspotRequest("POST", "/crm/v3/objects/products/search", body);
  return result.results?.[0] || null;
}

async function createLineItemFromProduct(product: any, item: { sku: string; quantity: number }) {
  const properties = {
    name: product.properties?.name || product.properties?.hs_sku || item.sku,
    quantity: String(item.quantity)
  };

  if (product.properties?.price != null) {
    properties.price = String(product.properties.price);
  }

  if (product.id) {
    properties.hs_product_id = product.id;
  }

  return await hubspotRequest("POST", "/crm/v3/objects/line_items", { properties });
}

async function associateLineItemToDeal(lineItemId: string, dealId: string) {
  const payload = [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 20
    }
  ];
  await hubspotRequest("PUT", `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`, payload);
}

async function main() {
  loadEnv();

  console.log("Creating line items for deal:", DEAL_ID);
  console.log("");

  const created = [];

  for (const item of LINE_ITEMS) {
    console.log(`Processing SKU: ${item.sku} (quantity: ${item.quantity})`);

    const product = await findProductBySku(item.sku);
    if (!product) {
      console.error(`  ERROR: Product not found in HubSpot catalog`);
      continue;
    }

    const productName = product.properties.name;
    const productPrice = product.properties.price;
    console.log(`  Found product: ${productName} (Price: $${productPrice})`);

    const lineItem = await createLineItemFromProduct(product, item);
    if (lineItem?.id) {
      console.log(`  Line item created: ${lineItem.id}`);
      created.push({ sku: item.sku, lineItemId: lineItem.id, ok: true });
    } else {
      console.error(`  ERROR: Line item creation failed`);
    }
  }

  // Associate line items to deal
  console.log("");
  console.log("Associating line items to deal...");
  const lineItemIds = created.filter((c) => c.ok && c.lineItemId).map((c) => c.lineItemId);

  for (const lineItemId of lineItemIds) {
    try {
      await associateLineItemToDeal(lineItemId, DEAL_ID);
      console.log(`  Associated line item ${lineItemId} to deal`);
    } catch (error: any) {
      console.error(`  ERROR associating line item ${lineItemId}: ${error.message}`);
    }
  }

  // Create invoice
  console.log("");
  console.log("Creating invoice...");
  const properties = {
    hs_currency: "USD",
    hs_invoice_status: "draft"
  };

  const invoice = await hubspotRequest("POST", "/crm/v3/objects/invoices", { properties });
  const invoiceId = invoice.id;
  console.log("Invoice created:", invoiceId);

  // Associate line items to invoice
  const inputs = lineItemIds.map((lineItemId: string) => ({
    from: { id: invoiceId },
    to: { id: lineItemId },
    type: "invoice_to_line_item"
  }));

  try {
    await hubspotRequest("POST", "/crm/v4/associations", { inputs });
    console.log("All line items associated to invoice");
  } catch (error: any) {
    console.error("Batch association failed:", error.message);
  }

  // Associate deal to invoice
  try {
    await hubspotRequest(
      "PUT",
      `/crm/v3/objects/invoices/${invoiceId}/associations/deals/${DEAL_ID}/invoice_to_deal`,
      {}
    );
    console.log("Deal associated to invoice");
  } catch (error: any) {
    console.error("Failed to associate deal:", error.message);
  }

  // Update to open
  await hubspotRequest("PATCH", `/crm/v3/objects/invoices/${invoiceId}`, {
    properties: { hs_invoice_status: "open" }
  });
  console.log("Invoice status updated to open");

  // Get invoice link
  const updatedInvoice = await hubspotRequest("GET", `/crm/v3/objects/invoices/${invoiceId}`);
  console.log("");
  console.log("---INVOICE DETAILS---");
  console.log("Invoice ID:", invoiceId);
  console.log("Invoice Link:", updatedInvoice.properties?.hs_invoice_url || updatedInvoice.properties?.hs_invoice_link || "N/A");
}

main().catch(console.error);
