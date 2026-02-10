#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '231755183580';
const SKU = 'ZD-SUITE-GROWTH';
const AGENT_COUNT = 8;
const STARTUP_DISCOUNT = 0.20; // 20% startup discount
const ANNUAL_MONTHS = 12;

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
  properties: ['name', 'price', 'hs_sku', 'hs_product_id', 'description'],
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
const basePrice = Number(product.properties.price);
console.log('Found product:', productId, productName, 'Base Price:', basePrice);

// Calculate pricing with startup discount
const monthlyPerAgent = basePrice;
const monthlyTotal = monthlyPerAgent * AGENT_COUNT;
const annualTotalBeforeDiscount = monthlyTotal * ANNUAL_MONTHS;
const discountAmount = annualTotalBeforeDiscount * STARTUP_DISCOUNT;
const annualTotalAfterDiscount = annualTotalBeforeDiscount - discountAmount;
const finalPrice = Math.round(annualTotalAfterDiscount);

console.log('Price calculation:');
console.log('  - Base price per agent/month:', monthlyPerAgent);
console.log('  - Agents:', AGENT_COUNT);
console.log('  - Annual before discount:', annualTotalBeforeDiscount);
console.log('  - Startup discount (20%):', discountAmount);
console.log('  - Final annual price:', finalPrice);

// 2. Create line item with custom discounted price
const lineItemBody = {
  properties: {
    name: `${productName} - Annual with Startup Discount`,
    quantity: '1',
    price: String(finalPrice),
    hs_product_id: productId,
    description: `Suite Growth Annual plan for ${AGENT_COUNT} agents. Email + voice channels, 1,200-1,500 tickets/month. Includes 20% startup discount.`
  }
};

console.log('Creating line item...');
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

// 4. Create draft invoice (quote)
const invoiceProperties = {
  hs_title: `Apex Routing Solutions - Suite Growth Annual Quote`,
  hs_expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  hs_status: 'DRAFT',
  hs_language: 'en'
};

console.log('Creating draft invoice/quote...');
const quote = await hubspotRequest('POST', '/crm/v3/objects/quotes', { properties: invoiceProperties });
const quoteId = quote.id;
console.log('Quote created:', quoteId);

// 5. Associate quote to line item and deal
console.log('Setting up quote associations...');

try {
  await hubspotRequest(
    'PUT',
    `/crm/v3/objects/quotes/${quoteId}/associations/line_item/${lineItemId}/quote_to_line_item`,
    {}
  );
  console.log('Quote to line item associated');
} catch (e: any) {
  console.log('Line item association failed:', e.message);
}

try {
  await hubspotRequest(
    'PUT',
    `/crm/v3/objects/quotes/${quoteId}/associations/deal/${DEAL_ID}/quote_to_deal`,
    {}
  );
  console.log('Quote to deal associated');
} catch (e: any) {
  console.log('Deal association failed:', e.message);
}

// 6. Update deal stage
await hubspotRequest('PATCH', `/crm/v3/objects/deals/${DEAL_ID}`, {
  properties: {
    dealstage: 'contractsent',
    amount: String(finalPrice)
  }
});
console.log('Deal stage updated to contractsent');

console.log('');
console.log('---QUOTE SUMMARY---');
console.log('Quote ID:', quoteId);
console.log('Line Item ID:', lineItemId);
console.log('Total Annual:', '$' + finalPrice);
console.log('Monthly equivalent: $' + Math.round(finalPrice / 12));
