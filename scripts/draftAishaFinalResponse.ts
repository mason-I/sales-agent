import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "230846533051";
const contactId = "281288465868";

const intro = `Hi Aisha,

Great news! I'm glad the annual commitment works for your team.`;

const questions = [
  "So I can finalize your quote, which channels do your customers use to reach you? For example: email only, or do you also need web forms, chat, social messaging, or phone?"
];

const closing = `Once I have this, I'll get your Support Team quote over right away.`;

const emailBody = `${intro}

${questions.map(q => q).join('\n\n')}

${closing}

Zendesk`;

async function logEmailDraft() {
  const payload = {
    properties: {
      hs_email_direction: 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: 'Re: Quick question',
      hs_email_text: emailBody,
      hs_timestamp: new Date().toISOString()
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]
      },
      {
        to: { id: dealId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }]
      }
    ]
  };

  const result = await hubspotRequest('POST', '/crm/v3/objects/emails', payload);
  console.log('Email draft logged:', result.id);
}

logEmailDraft().catch(console.error);
