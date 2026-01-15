#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '221578086905';
const PRODUCT_ID = '198390332890';
const QUANTITY = 25;

async function createLineItem(sku: string, quantity: number) {
  const body = {
    properties: {
      name: 'Zendesk Suite Professional',
      quantity: String(quantity),
      price: '115',
      hs_product_id: PRODUCT_ID
    }
  };
  return await hubspotRequest('POST', '/crm/v3/objects/line_items', body);
}

async function associateLineItemToDeal(lineItemId: string, dealId: string) {
  const payload = [
    {
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: 20
    }
  ];
  return await hubspotRequest('PUT', `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`, payload);
}

async function createQuote(dealId: string, lineItemIds: string[]) {
  // Use quotes instead of invoices for formal quotes
  const properties = {
    hs_title: 'Zendesk Professional for 25 Agents',
    hs_expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    hs_status: 'DRAFT' // DRAFT has fewer requirements
  };

  // Quote to line item associations (type 208)
  const lineItemAssociations = lineItemIds.map((id) => ({
    to: { id },
    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 208 }]
  }));

  // Quote to deal association (type 214)
  lineItemAssociations.push({
    to: { id: dealId },
    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]
  });

  return await hubspotRequest('POST', '/crm/v3/objects/quotes', { properties, associations: lineItemAssociations });
}

// Create line item
const lineItem = await createLineItem('ZD-SUITE-PROFESSIONAL', QUANTITY);
console.log('Line item created:', JSON.stringify(lineItem, null, 2));

const lineItemId = lineItem.id;
if (!lineItemId) {
  console.error('Failed to create line item - no ID returned');
  process.exit(1);
}

// Associate to deal
await associateLineItemToDeal(lineItemId, DEAL_ID);
console.log('Line item associated to deal');

// Create quote
const quote = await createQuote(DEAL_ID, [lineItemId]);
console.log('Quote created:', JSON.stringify(quote, null, 2));

// Output for use in email
console.log('\n---QUOTE SUMMARY---');
console.log('Quote ID:', quote.id);
console.log('Line Item ID:', lineItemId);
