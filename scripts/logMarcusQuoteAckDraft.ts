#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const CONTACT_ID = '282018485697';
const DEAL_ID = '230850084322';

const emailBody = `Hi Marcus,

Great! I'll get that formal quote over to you right away.

$1,824 annually covers the Support Team tier for 8 agents, which includes:
- Ticket routing and automation
- Collaboration tools
- Reporting and analytics
- Email support channel

You'll receive the quote via a separate email shortly. Once you're ready to move forward, just let me know and I can get you set up.

Best,
Claude`;

const emailHeaders = {
  from: { email: "", firstName: "Claude", lastName: "" },
  to: [{ email: "marcus.thompson@apexlogistics.com" }]
};

const payload = {
  properties: {
    hs_email_direction: "EMAIL",
    hs_email_status: "SENT",
    hs_email_subject: "Re: Quick question",
    hs_email_text: emailBody,
    hs_timestamp: new Date().toISOString(),
    hs_email_headers: JSON.stringify(emailHeaders)
  },
  associations: [
    {
      to: { id: CONTACT_ID },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
    },
    {
      to: { id: DEAL_ID },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
    }
  ]
};

console.log('Logging email draft to HubSpot...');
const result = await hubspotRequest('POST', '/crm/v3/objects/emails', payload);
console.log('Email logged:', result.id);
