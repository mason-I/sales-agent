#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '231298784749';
const CONTACT_ID = '273278457692'; // Isabella's contact ID

// Draft response for Isabella - addresses her urgent implementation timeline
const subject = 'Re: Quick question - Quote & Implementation Timeline';

const body = `Hi Isabella,

Great news - $5,750/month is well within the investment range for what you're getting.

**Regarding your one-week timeline:**

Here's the honest answer: A basic Zendesk implementation can be live in days, not months. Your agents can be onboarded in just a few hours. We've seen companies go live quickly when they focus on the essentials first.

That said, a full omnichannel rollout with complex routing typically takes 2-3 weeks. For your urgent situation (solving routing and uptime issues right now), here's what I'd recommend:

- **Week 1**: Get email and basic routing live immediately to stop the bleeding
- **Weeks 2-3**: Layer in chat and phone as your team ramps up

If you need to accelerate this further, our Professional Services team can fast-track your implementation. This is an additional cost, but given that you're losing customers right now, it may be worth it.

**Your Quote:**

I've created the formal quote for Zendesk Suite Professional at $5,750/month (50 agents at $115/agent). This includes:

- Omnichannel routing to fix your distribution issues
- 99.9% uptime SLA
- Email, chat, and phone support channels
- Self-service help center

The quote is ready in your account.

Can you confirm:
1. Is the accelerated two-phase rollout (email first, then chat/phone) workable for your team?
2. Would you like me to include Professional Services for a faster implementation?

Let's get you live and stop those customer losses.

Best,
Claude`;

// Log the email as an engagement in HubSpot
const emailProperties = {
  hs_email_direction: 'EMAIL',
  hs_email_status: 'DRAFT',
  hs_email_subject: subject,
  hs_email_text: body,
  hs_timestamp: new Date().toISOString()
};

console.log('Creating email draft in HubSpot...');
const email = await hubspotRequest('POST', '/crm/v3/objects/emails', { properties: emailProperties });
const emailId = email.id;
console.log('Email draft created:', emailId);

// Associate to contact
await hubspotRequest('PUT', `/crm/v4/objects/emails/${emailId}/associations/contacts/${CONTACT_ID}`, [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]);
console.log('Associated to contact:', CONTACT_ID);

// Associate to deal
await hubspotRequest('PUT', `/crm/v4/objects/emails/${emailId}/associations/deals/${DEAL_ID}`, [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }]);
console.log('Associated to deal:', DEAL_ID);

console.log('\n--- EMAIL DRAFT ---');
console.log('Subject:', subject);
console.log('Email ID:', emailId);
console.log('\nBody:');
console.log(body);
