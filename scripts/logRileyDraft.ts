#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const contactId = "273316909510";
const dealId = "222852280814";
const subject = "Re: Quick question - Zendesk Pricing & Quote";

const intro = `Thanks for the details, Riley - that's exactly what I need to put together accurate pricing.`;

const questions: string[] = [];

const closing = `Based on 25 agents across email, chat, and social with ~4k tickets/month, here's what I'd recommend:

**Zendesk Suite Professional**
- 25 agents @ \$115/agent/month: \$2,875/month
- Annual commitment: \$34,500/year

This includes:
- Unified workspace for email, chat, and social messaging
- Ticketing, self-service help center, and basic automation
- 24/7 customer support and onboarding resources

I've attached a draft invoice for your review. The Professional tier fits your 6-week timeline and scales as you grow.

Once you're ready to proceed, I can convert this to an active invoice with a payment link.

Any questions about the included features or terms?`;

const body = [intro, ...questions, closing, "Zendesk"].filter(Boolean).join("\n\n");

async function main() {
  const emailProperties = {
    hs_email_direction: "EMAIL",
    hs_email_status: "SENT",
    hs_email_subject: subject,
    hs_email_text: body,
    hs_timestamp: new Date().toISOString()
  };

  const created = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
  const emailId = created.id;

  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
  );

  await hubspotRequest(
    "PUT",
    `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
    [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
  );

  // Update deal with captured info
  await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
    properties: {
      sw_primary_pain: "Need email + chat + social in one place",
      key_challenges: "Fragmented support channels",
      ticket_volume_per_month: "4000",
      agents_required: "25",
      support_channels: "email; live_chat; social_messaging",
      amount: "34500"
    }
  });

  console.log(JSON.stringify({ emailId, contactId, dealId }));
}

main();
