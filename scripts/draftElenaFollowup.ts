#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '230905683390';

// First, get the deal to find the associated contact
console.log('Fetching deal associations...');
const deal = await hubspotRequest('GET', `/crm/v3/objects/deals/${DEAL_ID}?associations=contacts`);

// Find the contact ID from associations
const contactId = deal.associations?.contacts?.results?.[0]?.id;

if (!contactId) {
  console.error('No contact found for deal:', DEAL_ID);
  process.exit(1);
}

console.log('Found contact ID:', contactId);

// Log the email as an engagement in HubSpot using structured format
const subject = 'Re: Your Zendesk inquiry';

const intro = `Hi Elena,

Thanks for reaching out. I understand you're working with a tight budget.

Zendesk starts at $19/agent/month, and we have options that scale with your needs.`;

const questions = [
  'So I can point you to the best fit, could you share a bit about what challenge your team is trying to solve? That\'ll help me recommend the right approach.'
];

const closing = `Thanks,

Zendesk`;

// Build the body with structured format
const questionLines = questions.map((q, i) => `${i + 1}) ${q}`).join('\n');
const body = [intro, questionLines, closing].filter(Boolean).join('\n\n');

const emailProperties = {
  hs_email_direction: 'EMAIL',
  hs_email_status: 'SENT',
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

console.log('Creating email draft in HubSpot...');
const email = await hubspotRequest('POST', '/crm/v3/objects/emails', { properties: emailProperties });
const emailId = email.id;
console.log('Email draft created:', emailId);

// Associate to contact
await hubspotRequest('PUT', `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`, [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]);
console.log('Associated to contact:', contactId);

// Associate to deal
await hubspotRequest('PUT', `/crm/v4/objects/emails/${emailId}/associations/deals/${DEAL_ID}`, [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }]);
console.log('Associated to deal:', DEAL_ID);

console.log('\n--- EMAIL DRAFT ---');
console.log('Subject:', subject);
console.log('Email ID:', emailId);
console.log('Contact ID:', contactId);
console.log('\nBody:');
console.log(body);
