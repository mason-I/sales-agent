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
  intro: `Hi Elena,

Thanks for reaching out and for your interest in Zendesk.

Here's a quick overview of our Suite plan pricing:

**Team**: $55/agent/month (billed annually)
- Email, messaging, and help center
- Up to 50 AI-powered automated answers

**Growth**: $89/agent/month (billed annually)
- Everything in Team, plus skills-based routing and multiple help centers

**Professional**: $115/agent/month (billed annually)
- Advanced AI agents, custom reports, SLAs, and collaboration tools

**Enterprise**: $169/agent/month (billed annually)
- Custom permissions, sandbox testing, and enterprise-grade security

All plans include our ticketing system, unified agent workspace, and access to the Zendesk Marketplace for integrations.`,
  questions: [
    'So I can point you to the right fit, roughly how many agents do you anticipate needing?'
  ],
  closing: `Thanks,

Zendesk`
};

const intro = bodyParts.intro || '';
const questions = (bodyParts.questions || []).join('\n\n');
const closing = bodyParts.closing || '';
const body = [intro, questions, closing].filter(Boolean).join('\n\n');

const noteBody = 'EMAIL DRAFT\n\nTo: Contact (from deal)\nSubject: Zendesk Pricing for Pinnacle Industries\n\n' + body;

client.crm.objects.notes.basicApi.create({
  properties: {
    hs_timestamp: Date.now().toString(),
    hs_note_body: noteBody,
    hubspot_owner_id: ''
  },
  associations: [
    {
      to: { id: '230905683390' },
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
    dealId: '230905683390'
  }, null, 2));
}).catch(e => {
  console.error('Error logging email draft:', e.message);
  process.exit(1);
});
