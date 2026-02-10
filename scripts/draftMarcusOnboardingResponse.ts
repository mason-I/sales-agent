import 'dotenv/config';
import { logEmailEngagement, updateDealProperties } from '../src/lib/hubspot.ts';

const contactId = '281529319905';
const dealId = '231691771324';

async function main() {
  // First update deal with new info (ticket volume and support channels)
  await updateDealProperties(dealId, {
    ticket_volume_per_month: '900',
    support_channels: 'email'
  });

  console.log('Updated deal with ticket volume and support channels');

  // Log the email draft
  const emailBody = `Hi Marcus,

Great to hear the routing automation would solve things - that's exactly what Support Team is built for.

Team ($1,824/year) is self-service setup, but you're not on your own. Here's what's included:

- On-demand training at training.zendesk.com (24/7 access)
- Implementation guides in our help center
- Zendesk Community for peer support

Most teams are up and running within a day or two.

So I can get a sense of timing, when are you looking to make this change?

Thanks,
Zendesk`;

  await logEmailEngagement({
    subject: 'Re: Quick question',
    body: emailBody,
    fromEmail: 'sales@zendesk.com',
    fromName: 'Zendesk',
    toEmail: 'marcus.okonkwo@apexrouting.com',
    direction: 'EMAIL'
  }, contactId, dealId);

  console.log('Logged email draft to HubSpot');
  console.log('Contact ID:', contactId);
  console.log('Deal ID:', dealId);
  console.log('---');
  console.log('Email:');
  console.log(emailBody);
}

main().catch(console.error);
