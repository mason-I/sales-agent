#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '221055793628';
const SKU = 'ZD-SUITE-GROWTH';
const AGENT_COUNT = 25;

// 1. Find the product by SKU
const searchBody = {
  filterGroups: [
    {
      filters: [
        {
          propertyName: 'hs_sku',
          operator: 'EQ',
          value: SKU
        }
      ]
    }
  ],
  properties: ['name', 'price', 'hs_sku'],
  limit: 1
};

console.log('Searching for product:', SKU);
const searchResult = await hubspotRequest('POST', '/crm/v3/objects/products/search', searchBody);

if (!searchResult.results || searchResult.results.length === 0) {
  console.error('Product not found:', SKU);
  process.exit(1);
}

const product = searchResult.results[0];
const productId = product.id;
const productName = product.properties.name;
const productPrice = product.properties.price;
console.log('Found product:', productId, productName, 'Price:', productPrice);

// 2. Create line item for 25 agents
const lineItemBody = {
  properties: {
    name: productName,
    quantity: String(AGENT_COUNT),
    price: productPrice,
    hs_product_id: productId
  }
};

console.log('Creating line item for', AGENT_COUNT, 'agents...');
const lineItem = await hubspotRequest('POST', '/crm/v3/objects/line_items', lineItemBody);
const lineItemId = lineItem.id;
console.log('Line item created:', lineItemId);

// 3. Associate line item to deal
const assocPayload = [
  {
    associationCategory: 'HUBSPOT_DEFINED',
    associationTypeId: 20
  }
];
console.log('Associating line item to deal...');
await hubspotRequest('PUT', `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${DEAL_ID}`, assocPayload);
console.log('Line item associated to deal');

// 4. Create draft invoice (quote) - create first, then add associations
const monthlyTotal = Number(productPrice) * AGENT_COUNT;
const invoiceProperties = {
  hs_title: `Zendesk Suite Growth for ${AGENT_COUNT} Agents - Draft Invoice`,
  hs_expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  hs_status: 'DRAFT',
  hs_language: 'en'
};

console.log('Creating draft invoice/quote...');
const quote = await hubspotRequest('POST', '/crm/v3/objects/quotes', { properties: invoiceProperties });
const quoteId = quote.id;
console.log('Quote created:', quoteId);

// 5. Use the v4 batch association API
console.log('Setting up quote associations...');

// First, let's check what association types are available for quotes
try {
  const associations = {
    inputs: [
      {
        from: { id: quoteId },
        to: { id: lineItemId },
        type: 'quote_to_line_item'
      },
      {
        from: { id: quoteId },
        to: { id: DEAL_ID },
        type: 'quote_to_deal'
      }
    ]
  };

  await hubspotRequest('POST', '/crm/v4/associations', associations);
  console.log('Associations created successfully');
} catch (e: any) {
  console.log('v4 API failed, trying v3 single associations...');

  // Try v3 single associations
  try {
    await hubspotRequest(
      'PUT',
      `/crm/v3/objects/quotes/${quoteId}/associations/line_item/${lineItemId}/quote_to_line_item`,
      {}
    );
    console.log('Quote to line item associated');
  } catch (e2) {
    console.log('Line item association failed:', e2.message);
  }

  try {
    await hubspotRequest(
      'PUT',
      `/crm/v3/objects/quotes/${quoteId}/associations/deal/${DEAL_ID}/quote_to_deal`,
      {}
    );
    console.log('Quote to deal associated');
  } catch (e2) {
    console.log('Deal association failed:', e2.message);
  }
}

console.log('');
console.log('---QUOTE SUMMARY---');
console.log('Quote ID:', quoteId);
console.log('Line Item ID:', lineItemId);
console.log('Monthly Total: $' + monthlyTotal);
