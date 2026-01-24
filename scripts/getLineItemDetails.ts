import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();

    // The IDs from associations - these are toObjectIds (the actual line item IDs)
    const lineItemIds = [
        "218387440093",
        "218572079597",
        "218572082645",
        "218584683995",
        "218584691190",
        "218586818016",
        "218592305632"
    ];

    // Try to fetch one to verify it's a valid line item
    const first = await hubspotRequest("GET", `/crm/v3/objects/line_items/${lineItemIds[0]}?properties=name,quantity,price`);
    console.log("First line item:");
    console.log(JSON.stringify(first, null, 2));
}

main().catch(console.error);
