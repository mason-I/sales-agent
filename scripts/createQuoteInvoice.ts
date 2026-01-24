import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = "221055793628";

    // Line item IDs from the deal
    const lineItemIds = [
        "218387440093",
        "218572079597",
        "218572082645",
        "218584683995",
        "218584691190",
        "218586818016",
        "218592305632"
    ];

    // Create a quote (which can serve as invoice/payable link)
    const properties = {
        hs_title: `Invoice - Zendesk Suite Growth for 25 Agents`,
        hs_status: "DRAFT",
        hs_language: "en",
        hs_expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    console.log("Creating quote/invoice...");

    const quote = await hubspotRequest("POST", "/crm/v3/objects/quotes", { properties });
    const quoteId = quote.id;

    console.log("Quote created:", quoteId);

    // Now associate line items using v3 single associations
    for (const lineItemId of lineItemIds) {
        try {
            await hubspotRequest(
                "PUT",
                `/crm/v3/objects/quotes/${quoteId}/associations/line_items/${lineItemId}/quote_to_line_item`,
                {}
            );
            console.log(`Associated line item ${lineItemId}`);
        } catch (error: any) {
            console.error(`Failed to associate line item ${lineItemId}:`, error.message);
        }
    }

    // Associate quote to deal
    try {
        await hubspotRequest(
            "PUT",
            `/crm/v3/objects/quotes/${quoteId}/associations/deals/${dealId}/quote_to_deal`,
            {}
        );
        console.log(`Associated quote to deal ${dealId}`);
    } catch (error: any) {
        console.error(`Failed to associate deal:`, error.message);
    }

    // Get the quote URL
    const updatedQuote = await hubspotRequest("GET", `/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_status,hs_url,hs_public_url`);
    console.log("\nQuote ID:", quoteId);
    console.log("Quote URL:", updatedQuote.properties?.hs_url || updatedQuote.properties?.hs_public_url || "N/A");
    console.log("Full quote:", JSON.stringify(updatedQuote, null, 2));
}

main().catch(console.error);
