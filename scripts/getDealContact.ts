import { hubspotRequest } from "../src/lib/hubspot.js";

const dealId = process.argv[2] || "222852280814";

async function main() {
  const contacts = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/contacts`);
  const contactId = contacts.results?.[0]?.toObjectId || null;
  console.log(JSON.stringify({ dealId, contactId }));
}

main().catch(console.error);
