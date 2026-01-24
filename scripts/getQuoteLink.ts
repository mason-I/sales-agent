#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const quoteId = process.argv[2] || "205304452556";

// Get quote with all properties including public URL
const quote = await hubspotRequest("GET", `/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_status,hs_url,hs_public_url,hs_quote_link`);
console.log(JSON.stringify(quote, null, 2));
