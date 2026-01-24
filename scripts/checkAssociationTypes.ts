import { loadEnv } from "../src/lib/env.js";
import { hubspotRequest } from "../src/lib/hubspot.js";

async function main() {
    loadEnv();

    // Get association schema for invoices
    const schema = await hubspotRequest("GET", "/crm/v4/schemas/Invoices");
    console.log("Invoice schema associations:");
    console.log(JSON.stringify(schema, null, 2));
}

main().catch(console.error);
