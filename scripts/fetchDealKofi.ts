import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot.ts";

const dealId = "230905673157";

const deal = await hubspotRequest(
  "GET",
  `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,amount,description,sw_primary_pain,key_challenges,ticket_volume_per_month,timeline_for_change,agents_required,support_channels`
);
console.log("DEAL:", JSON.stringify(deal, null, 2));

const contacts = await fetchDealAssociations(dealId, "contacts");
console.log("CONTACTS:", JSON.stringify(contacts, null, 2));

// Get contact details
for (const c of contacts) {
  const contact = await hubspotRequest("GET", `/crm/v3/objects/contacts/${c.toObjectId}?properties=firstname,lastname,email,jobtitle`);
  console.log(`CONTACT ${c.toObjectId}:`, JSON.stringify(contact, null, 2));
}
