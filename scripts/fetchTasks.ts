import { loadEnv } from "../src/lib/env";
import { fetchDealTaskIds, fetchTask } from "../src/lib/hubspot";

async function main() {
    loadEnv();
    const dealId = "217166074337";
    const taskIds = await fetchDealTaskIds(dealId);
    console.log(`Found ${taskIds.length} tasks`);
    for (const id of taskIds.slice(-2)) {
        const task = await fetchTask(id);
        console.log(`Task ${id}:`, JSON.stringify(task, null, 2));
    }
}

main().catch(console.error);
