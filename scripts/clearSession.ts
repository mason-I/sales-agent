import { loadEnv } from "../src/lib/env";
import { updateDealProperties } from "../src/lib/hubspot";

async function main() {
    loadEnv();
    const dealId = "217166074337";
    await updateDealProperties(dealId, { session_id: "" });
    console.log(`Session cleared for deal ${dealId}`);
}

main().catch(console.error);
