import { hubspotRequest } from "../src/lib/hubspot.js";

async function getContact() {
  const dealId = "231755183580";

  const associations = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`);
  console.log(JSON.stringify(associations, null, 2));
}

getContact().catch(console.error);
