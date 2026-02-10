import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231255928292";

// Get deal
const deal = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname`);
console.log("Deal:", deal.properties?.dealname);

// Try different association endpoints
try {
  const contacts = await hubspotRequest("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`);
  console.log("Contacts v3:", JSON.stringify(contacts, null, 2));
} catch (e) {
  console.error("v3 failed:", e.message);
}

try {
  const contacts = await hubspotRequest("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts`);
  console.log("Contacts v4:", JSON.stringify(contacts, null, 2));
} catch (e) {
  console.error("v4 failed:", e.message);
}
