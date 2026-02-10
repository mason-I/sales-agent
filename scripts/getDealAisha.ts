#!/usr/bin/env bun
import { hubspotRequest, fetchDealAssociations } from "../src/lib/hubspot.ts";

const DEAL_ID = "230846533051";

// Get deal
const deal = await hubspotRequest("GET", `/crm/v3/objects/deals/${DEAL_ID}`, null);
console.log("Deal properties:", JSON.stringify(deal.properties, null, 2));

// Get contact associations
const contacts = await fetchDealAssociations(DEAL_ID, "contacts");
console.log("\nContact associations:", JSON.stringify(contacts, null, 2));

if (contacts.length > 0) {
  const contactId = contacts[0].toObjectId;
  console.log("\nContact ID:", contactId);
  const contact = await hubspotRequest("GET", `/crm/v3/objects/contacts/${contactId}`, null);
  console.log("\nContact:", JSON.stringify(contact.properties, null, 2));
}
