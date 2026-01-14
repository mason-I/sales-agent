import { QUALIFICATION_STAGE_ID } from "../config/dealStage";
import {
  getContactByEmail,
  upsertContact,
  updateContact,
  getContactAssociations,
  createDeal,
  associateContactWithDeal,
  logEmailEngagement
} from "../lib/hubspot";

const REQUIRED_CONTACT_FIELDS = ["email"] as const;

function extractContactProperties(emailData: any) {
  const properties: Record<string, string> = {};

  if (emailData.fromEmail) properties.email = String(emailData.fromEmail).trim();

  if (emailData.fromName) {
    const nameParts = String(emailData.fromName).trim().split(/\s+/).filter(Boolean);
    if (nameParts[0]) properties.firstname = nameParts[0];
    if (nameParts.length > 1) properties.lastname = nameParts.slice(1).join(" ");
  }

  if (emailData.phone) properties.phone = String(emailData.phone).trim();
  if (emailData.company) properties.company = String(emailData.company).trim();
  if (emailData.website) properties.website = String(emailData.website).trim();
  if (emailData.jobtitle) properties.jobtitle = String(emailData.jobtitle).trim();

  return properties;
}

function assertRequiredContactFields(properties: Record<string, string>) {
  for (const key of REQUIRED_CONTACT_FIELDS) {
    const value = properties[key];
    if (!value || !value.trim()) {
      throw new Error(`Missing required contact field: ${key}`);
    }
  }
}

function assertNoEmptyStrings(properties: Record<string, string>) {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && value.trim().length === 0) {
      throw new Error(`Contact property "${key}" is empty.`);
    }
  }
}

export async function runPreLlm(emailData: any) {
  if (!emailData || !emailData.fromEmail) {
    throw new Error("Email data with fromEmail is required");
  }

  const email = String(emailData.fromEmail).toLowerCase().trim();

  const contactProperties = extractContactProperties(emailData);
  contactProperties.email = email;
  assertRequiredContactFields(contactProperties);
  assertNoEmptyStrings(contactProperties);

  const existingContact = await getContactByEmail(email);
  let contactId: string | null = null;
  let contact: any = null;

  if (existingContact?.id) {
    contactId = existingContact.id;
    contact = existingContact;
    await updateContact(contactId!, contactProperties);
  } else {
    const upsertResult = await upsertContact(contactProperties);
    contactId = upsertResult.id;
    contact = upsertResult;
    if (!contactId) {
      throw new Error("Contact upsert succeeded but no contact ID returned.");
    }
  }

  let dealId: string | null = emailData.dealId || null;

  if (!dealId && contactId) {
    const dealAssociations = await getContactAssociations(contactId, "deal");
    if (dealAssociations.length === 0) {
      const dealName = emailData.subject || `Deal for ${emailData.fromName || email}`;
      const deal = await createDeal(dealName, null, QUALIFICATION_STAGE_ID);
      dealId = deal.id;
      if (dealId) {
        await associateContactWithDeal(contactId, dealId);
      }
    } else {
      dealId = dealAssociations[0].toObjectId;
    }
  }

  let emailEngagementId: string | null = null;
  if (emailData.logEmail !== false && contactId) {
    const engagement = await logEmailEngagement(
      {
        subject: emailData.subject,
        body: emailData.body,
        fromEmail: emailData.fromEmail,
        fromName: emailData.fromName,
        toEmail: emailData.toEmail,
        timestamp: emailData.timestamp,
        direction: emailData.direction || "INCOMING_EMAIL"
      },
      contactId,
      dealId
    );
    emailEngagementId = engagement.id;
  }

  return {
    success: true,
    contactId,
    dealId,
    contact,
    emailEngagementId
  };
}
