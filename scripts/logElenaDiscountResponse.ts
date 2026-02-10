import { logEmailEngagement } from '../src/lib/hubspot.js';

async function main() {
  const result = await logEmailEngagement({
    subject: 'Re: Quick question',
    body: `Thanks for being upfront about your priorities, Elena. I really appreciate the clarity.

Since social messaging consolidation is a priority for your team and we're only $184 apart on your annual budget, I can offer a one-time 5% discount on the Suite Team annual plan if you commit upfront. This brings it to $4,924.80/year—within your budget.

This includes:
- All social messaging channels (Instagram, Facebook, WhatsApp, etc.)
- 8 agent seats
- Unified inbox across email and social

If you'd like to proceed, I'll send over a formal quote for your review.

Let me know your preference.

Zendesk`,
    direction: 'EMAIL',
    fromEmail: 'support@zendesk.com',
    fromName: 'Zendesk',
    toEmail: 'elena.nguyen@pinnacleindustries.com'
  },
  '282018485697',
  '230905683390'
  );
  console.log('Draft logged:', result);
}

main().catch(console.error);
