/**
 * Log an email draft to HubSpot via CRM service
 */
const hubspot = require('@hubspot/api-client');

exports.main = async (context, { contactId, dealId, subject, bodyParts }) => {
  const hubspotClient = new hubspot.Client({ accessToken: context.hubspotAccessToken });
  
  // Build email body from parts
  const intro = bodyParts.intro || '';
  const questions = (bodyParts.questions || []).map(q => q).join('\n\n');
  const closing = bodyParts.closing || '';
  
  const body = [intro, questions, closing].filter(Boolean).join('\n\n');
  
  // Log engagement activity to deal
  await hubspotClient.crm.objects.notes.basicApi.create({
    properties: {
      hs_timestamp: Date.now().toString(),
      hs_object_id: dealId,
      hs_note_body: `EMAIL DRAFT\n\nTo: Contact ${contactId}\nSubject: ${subject}\n\n${body}`,
      hubspot_owner_id: context.ownerId || ''
    }
  });
  
  return { success: true, contactId, dealId };
};
