import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();
    const dealId = process.env.DEAL_ID || "221055793628";
    const result = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}/associations/line_items`);
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
