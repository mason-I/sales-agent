const fs = require('fs');
require('dotenv').config();

const draft = JSON.parse(fs.readFileSync('/tmp/email_draft.json', 'utf-8'));
const hubspotToken = process.env.HUBSPOT_PRIVATE_TOKEN || process.env.HUBSPOT_API_KEY;
const apiBase = process.env.HS_API_BASE || 'https://api.hubapi.com';

if (!hubspotToken) {
  console.error(JSON.stringify({
    success: false,
    action: 'ERROR',
    reason: 'HUBSPOT_PRIVATE_TOKEN or HUBSPOT_API_KEY not set'
  }));
  process.exit(1);
}

const emailProperties = {
  hs_email_direction: 'EMAIL',
  hs_email_status: 'SENT',
  hs_email_subject: draft.subject,
  hs_email_text: draft.body,
  hs_timestamp: new Date().toISOString()
};

(async () => {
  try {
    const createResponse = await fetch(`${apiBase}/crm/v3/objects/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hubspotToken}`
      },
      body: JSON.stringify({ properties: emailProperties })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create email: ${createResponse.status} - ${errorText}`);
    }

    const emailResult = await createResponse.json();
    const emailId = emailResult.id;

    await fetch(`${apiBase}/crm/v4/objects/emails/${emailId}/associations/contacts/${draft.contactId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hubspotToken}`
      },
      body: JSON.stringify([{
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 198
      }])
    });

    await fetch(`${apiBase}/crm/v4/objects/emails/${emailId}/associations/deals/${draft.dealId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hubspotToken}`
      },
      body: JSON.stringify([{
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: 210
      }])
    });

    console.log(JSON.stringify({
      success: true,
      action: 'EMAIL_LOGGED',
      emailId,
      subject: draft.subject,
      contactId: draft.contactId,
      dealId: draft.dealId
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      action: 'ERROR',
      reason: err.message
    }));
    process.exit(1);
  }
})();
