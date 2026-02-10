import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot.ts";

const dealId = "234316403143";
const deal = await hubspotRequest(
  "GET",
  `/crm/v3/objects/deals/${dealId}?properties=dealname,deal_contact_id,dealstage`
);
console.log("DEAL:", JSON.stringify(deal, null, 2));

const contacts = await fetchDealAssociations(dealId, "contacts");
console.log("CONTACTS:", JSON.stringify(contacts, null, 2));

for (const c of contacts) {
  const contact = await hubspotRequest("GET", `/crm/v3/objects/contacts/${c.toObjectId}?properties=firstname,lastname,email,jobtitle`);
  console.log(`CONTACT ${c.toObjectId}:`, JSON.stringify(contact, null, 2));
}
