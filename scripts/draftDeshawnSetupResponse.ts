#!/usr/bin/env bun
import { logEmailEngagement, fetchDealAssociations } from "../src/lib/hubspot.ts";

const dealId = "231034143191";
const subject = "Re: Quick question about your services";

const intro = `Great question. For a setup like yours—starting as a solo operator—you're typically looking at days, not weeks.

The core setup is straightforward: create your email channel, set up basic ticket fields and views, and you're up and running. Many small teams are live within a few days. The more complex pieces (automations, SLA policies, multi-channel setups like Help Center or messaging) can be added as you grow.`;

const questions: string[] = []; // Nurture mode - 0 questions per guardrails

const closing = `Since you're still exploring, no pressure. When you're ready to dive deeper, I'm happy to walk through what a setup would look like for Apex Logistics specifically.

Zendesk`;

const body = [intro, ...questions, closing].filter(Boolean).join("\n\n");

console.log("Subject:", subject);
console.log("\nBody:");
console.log(body);
console.log("\n---\n");

// Get contact ID from deal associations
const dealAssociations = await fetchDealAssociations(dealId, "contacts");
const contactId = dealAssociations.length > 0 ? dealAssociations[0].toObjectId : null;

if (!contactId) {
  console.error("No contact associated with deal");
  process.exit(1);
}

console.log("Found contact:", contactId);

const result = await logEmailEngagement({
  subject,
  body,
  fromEmail: "support@zendesk.com",
  fromName: "Zendesk",
  toEmail: "deshawn@apexlogisticssolutions.com",
  direction: "EMAIL"
}, contactId, dealId);

console.log("Email draft logged successfully!");
console.log("Email ID:", result.id);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
