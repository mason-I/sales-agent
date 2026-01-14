import { loadEnv } from '../src/lib/env.js';
import { fetchDealEngagements } from '../src/lib/hubspot.js';

loadEnv();

async function main() {
    const engagements = await fetchDealEngagements('217166074337');
    const draftReply = engagements.find(e => e.type === 'email' && e.direction === 'EMAIL');

    if (draftReply) {
        console.log('=== AGENT DRAFT REPLY (Turn 1) ===');
        console.log('Subject:', draftReply.subject);
        console.log('Timestamp:', new Date(draftReply.timestamp).toLocaleString());
        console.log('\nBody:\n', draftReply.body);
    } else {
        console.log('No draft reply found');
    }
}

main();
