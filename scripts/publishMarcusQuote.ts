#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const QUOTE_ID = '213452297717';

async function main() {
  // Try to publish the quote to get a public URL
  try {
    const published = await hubspotRequest("POST", `/crm/v3/objects/quotes/${QUOTE_ID}/public_url`);
    console.log("Published quote:");
    console.log(JSON.stringify(published, null, 2));
  } catch (error: any) {
    console.error("Failed to publish quote:", error.message);

    // Try alternate endpoint format
    try {
      const published2 = await hubspotRequest("POST", `/crm/v3/objects/quotes/${QUOTE_ID}/public-url`);
      console.log("Published quote (alternate):");
      console.log(JSON.stringify(published2, null, 2));
    } catch (e2: any) {
      console.error("Alternate also failed:", e2.message);
    }
  }
}

main().catch(console.error);
