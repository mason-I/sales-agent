#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '231298784749';

// Draft response for Isabella - addresses her urgent implementation timeline
const draft = {
  to: 'isabella.nkosi@blueriverconsulting.com',
  subject: 'Re: Quick question - Quote & Implementation Timeline',
  body: `Hi Isabella,

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

[Link to quote will be added here]

Can you confirm:
1. Is the accelerated two-phase rollout (email first, then chat/phone) workable for your team?
2. Would you like me to include Professional Services for a faster implementation?

Let's get you live and stop those customer losses.

Best,
Claude`

};

// Log the email draft to HubSpot
console.log('Logging email draft to HubSpot...');
const logResult = await hubspotRequest('POST', '/crm/v3/objects/notes', {
  properties: {
    hs_note_body: JSON.stringify({
      type: 'email_draft',
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      quote_id: '213223537129',
      deal_id: DEAL_ID
    }),
    hs_attachment_ids: DEAL_ID,
    hs_timestamp: new Date().toISOString()
  },
  associations: [
    {
      to: { id: DEAL_ID },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 206 }]
    }
  ]
});

console.log('Email draft logged to HubSpot:', logResult.id);
console.log('');
console.log('---DRAFT EMAIL---');
console.log('To:', draft.to);
console.log('Subject:', draft.subject);
console.log('');
console.log(draft.body);
