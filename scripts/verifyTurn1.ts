import { loadEnv } from '../src/lib/env.js';
import { fetchDealProperties, fetchDealEngagements, getContactByEmail } from '../src/lib/hubspot.js';

loadEnv();

async function main() {
    const dealId = '217166074337';
    const email = 'sam.whitfield.1736578948@example.com';

    const props = await fetchDealProperties(dealId, [
        'dealname',
        'dealstage',
        'deal_summary',
        'sw_primary_pain',
        'key_challenges',
        'timeline_for_change',
        'agents_required',
        'support_channels',
        'ticket_volume_per_month',
        'amount'
    ]);
    const engagements = await fetchDealEngagements(dealId);
    const contact = await getContactByEmail(email);

    console.log('=== TURN 1 VERIFICATION ===');
    console.log('\nDeal Properties:', JSON.stringify(props, null, 2));
    console.log('\nContact:', JSON.stringify({ id: contact?.id, email: contact?.properties?.email, firstname: contact?.properties?.firstname, lastname: contact?.properties?.lastname, company: contact?.properties?.company }, null, 2));
    console.log('\nEngagements (Total: ' + engagements.length + '):');
    engagements.forEach((e, i) => {
        console.log(`${i + 1}. [${e.type}] ${e.direction}: ${e.subject?.substring(0, 50)} (${new Date(e.timestamp).toLocaleString()})`);
    });
    console.log('\nMost Recent Engagement Body:', engagements[engagements.length - 1]?.body?.substring(0, 500));
}

main();
