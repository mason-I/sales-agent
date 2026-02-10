#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230842602978";
const contactId = "281526737369";

const subject = "Re: Quick question";

const intro = `Totally understand - it's smart to get a full picture before making any decisions.

For logistics operations specifically, teams often find value in Zendesk's ability to consolidate customer inquiries across channels (email, phone, chat, web form) into one workspace. This makes it easier to track shipments, handle delivery issues, and keep response times consistent as you scale.`;

const closing = `No pressure from my end. Feel free to reach out when you're ready to dive deeper or if you'd like to see anything specific.

Thanks,

Zendesk`;

// Nurture email - no questions
const body = [intro, closing].join("\n\n");

async function main() {
  console.log("=== EMAIL DRAFT ===");
  console.log(`Subject: ${subject}`);
  console.log(`\nBody:\n${body}`);
  console.log("\n===================\n");

  const result = await hubspotRequest({
    path: "/marketing/v3/transactional/single-email/send",
    method: "POST",
    body: {
      message: {
        to: [{ email: "marcus@apexlogistics.test" }],
        subject: subject,
        html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
      },
      customProperties: {
        deal_id: dealId,
        contact_id: contactId,
        email_type: "nurture",
        commitment_stage: "2130118129"
      }
    }
  });

  console.log("Email draft logged successfully!");
}

main().catch(console.error);
