import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const quoteId = "204842708446"; // The original quote ID

    // Try to publish the quote to get a public URL
    try {
        const published = await hubspotRequest("POST", `/crm/v3/objects/quotes/${quoteId}/public_url`);
        console.log("Published quote:");
        console.log(JSON.stringify(published, null, 2));
    } catch (error: any) {
        console.error("Failed to publish quote:", error.message);

        // Try alternate endpoint format
        try {
            const published2 = await hubspotRequest("POST", `/crm/v3/objects/quotes/${quoteId}/public-url`);
            console.log("Published quote (alternate):");
            console.log(JSON.stringify(published2, null, 2));
        } catch (e2: any) {
            console.error("Alternate also failed:", e2.message);
        }
    }
}

main().catch(console.error);
