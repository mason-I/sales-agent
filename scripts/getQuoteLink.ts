#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const QUOTE_ID = process.argv[2] || '213223537129';

// Fetch quote with properties including the quote URL
const quote = await hubspotRequest(
  'GET',
  `/crm/v3/objects/quotes/${QUOTE_ID}?properties=hs_title,hs_status,hs_expiration_date,hs_quote_url`
);

console.log('Quote ID:', quote.id);
console.log('Title:', quote.properties?.hs_title);
console.log('Status:', quote.properties?.hs_status);
console.log('Expiration:', quote.properties?.hs_expiration_date);
console.log('Quote URL:', quote.properties?.hs_quote_url || 'No URL property found');
