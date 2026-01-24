#!/usr/bin/env bun
import { hubspotRequest, logEmailEngagement, updateDealProperties } from '../src/lib/hubspot.ts';

const DEAL_ID = '221055793628';
const CONTACT_ID = '272730182126';
const QUOTE_ID = '204842708446';
const LINE_ITEM_ID = '218572082645';
const MONTHLY_TOTAL = 2225;

// Email draft content
const subject = 'Draft Invoice: Zendesk Suite Growth for 25 Agents';

const body = `Hi Riley,

Great to hear from you! Thanks for confirming the 25-agent count.

I've attached your draft invoice below for review. Here's the summary:

**Quote: Suite Growth for 25 Agents**
- Plan: Zendesk Suite Growth
- Agents: 25
- Monthly Total: $2,225 ($89/agent/month)
- Channels Included: Email, Chat, Social Messaging
- Help Center & Reporting: Included

**Quote ID:** ${QUOTE_ID}

This quote covers all your requirements—unified email, chat, and social in one platform, with 25 agents and ~4k tickets/month.

Next steps: Review the quote and let me know if you'd like to proceed or if you have any questions.

Best,
Claude`;

// Log the email engagement
console.log('Logging email engagement...');
const emailResult = await logEmailEngagement(
  {
    subject: subject,
    body: body,
    fromEmail: 'sales@zendesk.com',
    fromName: 'Claude',
    toEmail: '', // Empty since we use contact ID
    timestamp: new Date().toISOString(),
    direction: 'EMAIL'
  },
  CONTACT_ID,
  DEAL_ID
);
console.log('Email logged:', emailResult.id);

// Update deal properties with quote info
// Using valid HubSpot property names and values
const dealUpdates = {
  agents_required: '25',
  support_channels: 'email;social_messaging;live_chat', // Use semicolon-separated valid options
  dealstage: '2387718587' // Selected Tier stage
};

console.log('Updating deal properties...');
await updateDealProperties(DEAL_ID, dealUpdates);
console.log('Deal updated');

console.log('');
console.log('---SUMMARY---');
console.log('Email ID:', emailResult.id);
console.log('Quote ID:', QUOTE_ID);
console.log('Monthly Total: $' + MONTHLY_TOTAL);
