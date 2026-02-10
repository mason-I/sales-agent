import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot.ts";

const dealId = "230905683390";

const contacts = await fetchDealAssociations(dealId, "contacts");
console.log(JSON.stringify(contacts, null, 2));
