const hubspot = require('@hubspot/api-client');
const fs = require('fs');

// Read token from .env file
let token;
try {
  const envContent = fs.readFileSync('/Users/mason/Documents/Projects/AI Business/Sales-SDK/.env', 'utf-8');
  const match = envContent.match(/HUBSPOT_PRIVATE_TOKEN=([^\n\s]+)/);
  token = match ? match[1] : null;
} catch (e) {
  console.error('Could not read .env file:', e.message);
  process.exit(1);
}

if (!token) {
  console.error('HUBSPOT_ACCESS_TOKEN not found in .env');
  process.exit(1);
}

const client = new hubspot.Client({ accessToken: token });

const bodyParts = {
  intro: 'Hi Isabella,\n\nThanks for the quick context. Given the urgency and the routing/uptime issues you are experiencing, here is my recommendation:\n\n**Zendesk Suite Enterprise** for 50 agents\n\nThis tier is built for teams your size and includes advanced routing, 99.9% uptime SLA, and 24/7 support—exactly what you need to resolve these issues quickly.\n\nI have also added Workforce Engagement Management (WEM), which helps optimize routing and agent performance so tickets stop piling up.\n\n**Pricing:**\n- Suite Enterprise: $169/agent/month × 50 = $8,450/month\n- WEM Add-on: $50/agent/month × 50 = $2,500/month\n- **Total: $10,950/month**\n\nYour formal quote is here: https://442479746.hs-sites-ap1.com/DVLQxH2yjIuVgNOlyCPcC3BV\n\nYou can review and sign directly from that link. Once signed, onboarding typically takes 1-2 business days—we can have you live quickly given the urgency.',
  questions: [],
  closing: 'Let me know if you have any questions on the quote or need anything adjusted.\n\nThanks,\nZendesk'
};

const intro = bodyParts.intro || '';
const questions = (bodyParts.questions || []).join('\n\n');
const closing = bodyParts.closing || '';
const body = [intro, questions, closing].filter(Boolean).join('\n\n');

const noteBody = 'EMAIL DRAFT\n\nTo: Contact 2501\nSubject: Re: Help needed - urgent\n\n' + body;

client.crm.objects.notes.basicApi.create({
  properties: {
    hs_timestamp: Date.now().toString(),
    hs_note_body: noteBody,
    hubspot_owner_id: ''
  },
  associations: [
    {
      to: { id: '231298784749' },
      types: [
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 214  // Note to Deal association
        }
      ]
    }
  ]
}).then(r => {
  console.log(JSON.stringify({
    success: true,
    noteId: r.id,
    contactId: '2501',
    dealId: '231298784749'
  }, null, 2));
}).catch(e => {
  console.error('Error logging email draft:', e.message);
  process.exit(1);
});
