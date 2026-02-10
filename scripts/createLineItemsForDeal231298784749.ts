#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '231298784749';

const LINE_ITEMS = [
  { sku: 'ZD-SUITE-ENTERPRISE', quantity: 50 },
  { sku: 'ZD-ADDON-WORKFORCE-WEM', quantity: 50 }
];

async function findProductBySku(sku: string) {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'hs_sku',
            operator: 'EQ',
            value: sku
          }
        ]
      }
    ],
    properties: ['name', 'price', 'hs_sku'],
    limit: 1
  };

  const result = await hubspotRequest('POST', '/crm/v3/objects/products/search', body);
  return result.results?.[0] || null;
}

async function createLineItemFromProduct(product: any, item: { sku: string; quantity: number }) {
  const properties: Record<string, string> = {
    name: product.properties?.name || product.properties?.hs_sku || item.sku,
    quantity: String(item.quantity)
  };

  if (product.properties?.price != null) {
    properties.price = String(product.properties.price);
  }

  if (product.id) properties.hs_product_id = product.id;

  return await hubspotRequest('POST', '/crm/v3/objects/line_items', { properties });
}

async function associateLineItemToDeal(lineItemId: string, dealId: string) {
  const payload = [
    {
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: 20
    }
  ];
  await hubspotRequest('PUT', `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`, payload);
}

console.log('Creating line items for deal:', DEAL_ID);
console.log('');

const created: Array<{ sku: string; lineItemId?: string; ok: boolean; error?: string }> = [];

for (const item of LINE_ITEMS) {
  console.log(`Processing SKU: ${item.sku} (quantity: ${item.quantity})`);

  const product = await findProductBySku(item.sku);
  if (!product) {
    console.error(`  ERROR: Product not found in HubSpot catalog`);
    created.push({ sku: item.sku, ok: false, error: 'SKU not found in HubSpot catalog' });
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
    created.push({ sku: item.sku, ok: false, error: 'Line item creation failed' });
  }
}

// Associate all successful line items to the deal
console.log('');
console.log('Associating line items to deal...');
const lineItemIds = created.filter((c) => c.ok && c.lineItemId).map((c) => c.lineItemId as string);

for (const lineItemId of lineItemIds) {
  try {
    await associateLineItemToDeal(lineItemId, DEAL_ID);
    console.log(`  Associated line item ${lineItemId} to deal`);
  } catch (error: any) {
    console.error(`  ERROR associating line item ${lineItemId}: ${error.message}`);
  }
}

console.log('');
console.log('---SUMMARY---');
for (const item of created) {
  if (item.ok) {
    console.log(`  ${item.sku}: Line Item ID = ${item.lineItemId}`);
  } else {
    console.log(`  ${item.sku}: FAILED - ${item.error}`);
  }
}

console.log('');
console.log('Line Item IDs for invoice creation:');
console.log(lineItemIds.join(', '));
