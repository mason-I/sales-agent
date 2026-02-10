#!/usr/bin/env bun
import { logEmailEngagement, fetchDealAssociations, updateDealProperties } from "../src/lib/hubspot.ts";

const dealId = "230846533051";
const subject = "Re: Quick question";

const intro = `Hi Aisha,

Great to hear the Support Team plan sounds like the right fit. To answer your questions:

**Setup**: The Support Team plan is designed to be self-service. Most teams are up and running within hours to a few days, depending on how much data you're migrating. We have extensive help documentation and guides to walk you through each step. If you need hands-on assistance, professional onboarding services are available as a paid add-on.

**Contract terms**: Standard billing is annual, paid upfront. Month-to-month isn't available on the Support Team plan, but the annual commitment ensures you get the full $19/agent/month pricing.`;

const questions = [
  `Does an annual commitment work for your team's budget and timeline?`
];

const closing = `Thanks,`;

const body = [intro, ...questions, closing, "Zendesk"].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

// Fetch the associated contact ID
const contacts = await fetchDealAssociations(dealId, "contacts");
if (!contacts.length) {
  console.error("No contacts found for deal");
  process.exit(1);
}
const contactId = contacts[0].toObjectId;

// Log the email
const result = await logEmailEngagement(
  {
    subject,
    body,
    fromEmail: "support@zendesk.com",
    fromName: "Zendesk",
    toEmail: "aisha@meridianlogistics.com",
    direction: "EMAIL"
  },
  contactId,
  dealId
);

console.log("Email draft logged successfully!");
console.log("Email ID:", result.id);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
