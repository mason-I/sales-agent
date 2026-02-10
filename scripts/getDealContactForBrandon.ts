import { hubspotRequest } from "../src/lib/hubspot";

async function getDealContact() {
  const dealId = "234318104000";

  // Get associated contacts
  const associations = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`);
  console.log("Associated contacts:", JSON.stringify(associations, null, 2));

  if (associations.results && associations.results.length > 0) {
    const contactId = associations.results[0].id;
    console.log("\nPrimary contact ID:", contactId);
  }
}

getDealContact().catch(console.error);
