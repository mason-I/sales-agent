import { hubspotRequest } from '../src/lib/hubspot.ts';

async function main() {
  const deal = await hubspotRequest('GET', '/crm/v3/objects/deals/231680955886?associations=contacts', null);
  console.log(JSON.stringify(deal, null, 2));
}

main().catch(console.error);
