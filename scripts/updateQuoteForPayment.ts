import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const quoteId = "204842708446"; // The original quote ID

    // Update the quote with sender info to make it APPROVAL_NOT_NEEDED
    const properties = {
        hs_status: "APPROVAL_NOT_NEEDED",
        hs_sender_email: "sales@zendesk.com"
    };

    console.log("Updating quote for payment...");
    const updated = await hubspotRequest("PATCH", `/crm/v3/objects/quotes/${quoteId}`, { properties });
    console.log("Updated quote:");
    console.log(JSON.stringify(updated, null, 2));

    // Try to get the public URL
    const quote = await hubspotRequest("GET", `/crm/v3/objects/quotes/${quoteId}?properties=hs_public_url,hs_quote_link,hs_url`);
    console.log("\nQuote URL:", quote.properties?.hs_public_url || quote.properties?.hs_quote_link || quote.properties?.hs_url);
}

main().catch(console.error);
