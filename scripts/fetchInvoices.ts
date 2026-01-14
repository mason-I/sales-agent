import { loadEnv } from "../src/lib/env";
import { hubspotRequest } from "../src/lib/hubspot";

async function main() {
    loadEnv();
    const dealId = "217166074337";
    const result = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}/associations/invoices`);
    console.log("Invoice Associations:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
