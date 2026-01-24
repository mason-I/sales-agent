import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Get quote associations
    const assoc = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/quotes`);
    console.log("Quote associations:", JSON.stringify(assoc, null, 2));

    const quoteIds = assoc.results?.map((r: any) => r.toObjectId) || [];
    console.log("\nQuote IDs:", quoteIds);

    // Get details of each quote
    for (const quoteId of quoteIds) {
        const quote = await hubspotRequest("GET", `/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_status,hs_public_url,hs_url,hs_quote_link`);
        console.log(`\nQuote ${quoteId}:`);
        console.log(JSON.stringify(quote, null, 2));
    }
}

main().catch(console.error);
