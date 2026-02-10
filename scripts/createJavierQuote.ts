import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "230848620988";
const sku = "ZD-SUITE-TEAM";
const quantity = 8; // 8 agents

async function createQuote() {
  try {
    // Step 1: Find the product by SKU
    console.log("Searching for product:", sku);
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

    const productResult = await hubspotRequest("POST", "/crm/v3/objects/products/search", productBody);
    const product = productResult.results?.[0];

    if (!product) {
      console.error("Product not found in HubSpot:", sku);
      return;
    }

    console.log("Product found:", {
      id: product.id,
      name: product.properties.name,
      sku: product.properties.hs_sku,
      price: product.properties.price
    });

    // Step 2: Create the line item
    const lineItemBody = {
      properties: {
        name: product.properties.name,
        quantity: String(quantity),
        price: product.properties.price, // Use catalog price only
        hs_product_id: product.id
      }
    };

    const lineItem = await hubspotRequest("POST", "/crm/v3/objects/line_items", lineItemBody);
    const lineItemId = lineItem.id;

    if (!lineItemId) {
      console.error("Failed to create line item");
      return;
    }

    console.log("Line item created:", lineItemId);

    // Step 3: Associate line item to deal
    await hubspotRequest("PUT", `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`, [
      {
        associationCategory: "HUBSPOT_DEFINED",
        associationTypeId: 20
      }
    ]);

    console.log("Line item associated to deal");

    // Step 4: Calculate and update deal amount
    const priceValue = Number(product.properties.price);
    const totalAmount = priceValue * quantity * 12; // Annual billing

    await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
      properties: { amount: String(Math.round(totalAmount * 100) / 100) }
    });

    console.log("Deal amount updated to:", totalAmount);

    // Step 5: Create invoice
    const invoiceProperties = {
      hs_currency: "USD",
      hs_invoice_status: "draft"
    };

    const invoice = await hubspotRequest("POST", "/crm/v3/objects/invoices", { properties: invoiceProperties });
    const invoiceId = invoice?.id;

    if (!invoiceId) {
      console.error("Invoice creation failed");
      return;
    }

    console.log("Invoice created:", invoiceId);

    // Step 6: Associate line item to invoice
    await hubspotRequest("POST", "/crm/v3/associations/line_item/invoice/batch/create", {
      inputs: [{
        from: { id: lineItemId },
        to: { id: invoiceId },
        type: "line_item_to_invoice"
      }]
    });

    // Step 7: Associate deal to invoice
    await hubspotRequest("POST", "/crm/v3/associations/deal/invoice/batch/create", {
      inputs: [{
        from: { id: dealId },
        to: { id: invoiceId },
        type: "deal_to_invoice"
      }]
    });

    // Step 8: Update invoice to 'open' status
    const updatedInvoice = await hubspotRequest("PATCH", `/crm/v3/objects/invoices/${invoiceId}`, {
      properties: { hs_invoice_status: "open" }
    });

    const invoiceLink = updatedInvoice?.properties?.hs_invoice_url || updatedInvoice?.properties?.hs_invoice_link || "";

    console.log("\n=== QUOTE CREATED ===");
    console.log("Invoice ID:", invoiceId);
    console.log("Invoice Link:", invoiceLink);
    console.log("Line Item ID:", lineItemId);
    console.log("Total Amount (Annual):", totalAmount);

  } catch (error: any) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

createQuote();
