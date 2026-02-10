import { hubspotRequest } from '../src/lib/hubspot';

async function main() {
  const payload = {
    properties: {
      hs_email_direction: 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: 'Re: Quick question',
      hs_email_text: `Hi Riley,

Thanks for reaching out! Happy to help you learn more about Zendesk.

Zendesk is a customer service platform that brings all your customer conversations into one place—whether they come through email, chat, phone, or social media. It helps teams respond faster, track issues, and keep customers happy.

So I can point you to the most relevant info, what brought you to look for a support solution right now?

Best,
Zendesk`,
      hs_timestamp: new Date().toISOString()
    },
    associations: [
      {
        to: { id: '284936010221' },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]
      },
      {
        to: { id: '234309086693' },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }]
      }
    ]
  };

  const result = await hubspotRequest('POST', '/crm/v3/objects/emails', payload);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
