const API_BASE = process.env.HS_API_BASE || "https://api.hubapi.com";

function ensureToken() {
  const token = process.env.HUBSPOT_PRIVATE_TOKEN || process.env.HUBSPOT_API_KEY;
  if (!token) {
    throw new Error("HUBSPOT_PRIVATE_TOKEN or HUBSPOT_API_KEY environment variable is required");
  }
  return token;
}

export async function hubspotRequest<T = any>(method: string, endpoint: string, body: any = null): Promise<T> {
  const token = ensureToken();
  const url = `${API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {} as T;
}

export async function getContactByEmail(email: string) {
  const token = ensureToken();
  const url = `${API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

export async function upsertContact(properties: Record<string, string>) {
  if (!properties.email) {
    throw new Error("email is required for upsert operation");
  }
  const { email, ...rest } = properties;
  const payload = {
    inputs: [
      {
        id: email,
        idProperty: "email",
        properties: rest
      }
    ]
  };
  const result = await hubspotRequest<any>("POST", "/crm/v3/objects/contacts/batch/upsert", payload);
  return result.results?.[0] || result;
}

export async function updateContact(contactId: string, properties: Record<string, string>) {
  if (!contactId) {
    throw new Error("contactId is required for update operation");
  }
  if (!properties || Object.keys(properties).length === 0) {
    throw new Error("properties are required for update operation");
  }
  return await hubspotRequest<any>("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties });
}

export async function getContactAssociations(contactId: string, toObjectType = "deal") {
  const token = ensureToken();
  const url = `${API_BASE}/crm/v4/objects/contacts/${contactId}/associations/${toObjectType}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  return result.results || [];
}

export async function createDeal(dealName: string, pipelineId: string | null = null, stageId: string | null = null) {
  const properties: Record<string, string> = { dealname: dealName };
  if (pipelineId) properties.pipeline = pipelineId;
  if (stageId) properties.dealstage = stageId;

  return await hubspotRequest<any>("POST", "/crm/v3/objects/deals", { properties });
}

export async function associateContactWithDeal(contactId: string, dealId: string) {
  const payload = [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 4
    }
  ];
  await hubspotRequest("PUT", `/crm/v4/objects/contacts/${contactId}/associations/deal/${dealId}`, payload);
}

export async function logEmailEngagement(emailData: {
  subject?: string;
  body?: string;
  fromEmail?: string;
  fromName?: string;
  toEmail?: string;
  timestamp?: string;
  direction?: string;
}, contactId: string, dealId?: string | null) {
  const {
    subject,
    body,
    fromEmail,
    fromName,
    toEmail,
    timestamp,
    direction = "INCOMING_EMAIL"
  } = emailData;

  let fromFirstName = "";
  let fromLastName = "";
  if (fromName) {
    const parts = fromName.trim().split(/\s+/);
    fromFirstName = parts[0] || "";
    fromLastName = parts.slice(1).join(" ");
  }

  const emailTimestamp = timestamp || new Date().toISOString();

  const emailHeaders = {
    from: { email: fromEmail || "", firstName: fromFirstName, lastName: fromLastName },
    to: [{ email: toEmail || "" }]
  };

  const payload = {
    properties: {
      hs_email_direction: direction,
      hs_email_status: "SENT",
      hs_email_subject: subject || "(no subject)",
      hs_email_text: body || "",
      hs_timestamp: emailTimestamp,
      hs_email_headers: JSON.stringify(emailHeaders)
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
      }
    ]
  } as any;

  if (dealId) {
    payload.associations.push({
      to: { id: dealId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
    });
  }

  return await hubspotRequest<any>("POST", "/crm/v3/objects/emails", payload);
}

export async function fetchDealProperties(dealId: string, properties: string[]) {
  const props = properties.join(",");
  const result = await hubspotRequest<any>("GET", `/crm/v3/objects/deals/${dealId}?properties=${props}`);
  return result.properties || {};
}

export async function updateDealProperties(dealId: string, properties: Record<string, string>) {
  return await hubspotRequest<any>("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties });
}

export async function createDealNote(dealId: string, body: string, timestamp?: string) {
  if (!dealId) {
    throw new Error("dealId is required to create a note");
  }
  const properties: Record<string, string> = {
    hs_note_body: body,
    hs_timestamp: timestamp || new Date().toISOString()
  };
  const payload = {
    properties,
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }]
      }
    ]
  };
  return await hubspotRequest<any>("POST", "/crm/v3/objects/notes", payload);
}

export async function fetchDealAssociations(dealId: string, objectType: string, limit = 100) {
  const result = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/${objectType}?limit=${limit}`);
  return result.results || [];
}

export async function fetchDealTaskIds(dealId: string) {
  const assoc = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/tasks`);
  return assoc.results?.map((r: any) => r.toObjectId) || [];
}

export async function fetchTask(taskId: string, properties: string[] = [
  "hs_task_subject",
  "hs_task_body",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hs_createdate",
  "hs_lastmodifieddate"
]) {
  const props = properties.join(",");
  return await hubspotRequest<any>("GET", `/crm/v3/objects/tasks/${taskId}?properties=${props}`);
}

export async function createTask(properties: Record<string, string>, associations: any[] = []) {
  const payload: any = { properties };
  if (associations.length > 0) payload.associations = associations;
  return await hubspotRequest<any>("POST", "/crm/v3/objects/tasks", payload);
}

export async function updateTask(taskId: string, properties: Record<string, string>) {
  return await hubspotRequest<any>("PATCH", `/crm/v3/objects/tasks/${taskId}`, { properties });
}

export async function deleteTask(taskId: string) {
  return await hubspotRequest<any>("DELETE", `/crm/v3/objects/tasks/${taskId}`);
}

export async function fetchDealEngagements(dealId: string) {
  const engagements: Array<{
    id: string;
    type: string;
    direction: string;
    subject: string;
    body: string;
    timestamp: string;
    duration?: string;
  }> = [];

  try {
    const emailsRes = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/emails`);
    const emailIds = emailsRes.results?.map((r: any) => r.toObjectId) || [];

    for (const emailId of emailIds) {
      try {
        const email = await hubspotRequest<any>("GET", `/crm/v3/objects/emails/${emailId}?properties=hs_email_subject,hs_email_text,hs_email_direction,hs_timestamp`);
        engagements.push({
          id: String(emailId),
          type: "email",
          direction: email.properties?.hs_email_direction || "UNKNOWN",
          subject: email.properties?.hs_email_subject || "",
          body: email.properties?.hs_email_text || "",
          timestamp: email.properties?.hs_timestamp
        });
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  try {
    const callsRes = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/calls`);
    const callIds = callsRes.results?.map((r: any) => r.toObjectId) || [];

    for (const callId of callIds) {
      try {
        const call = await hubspotRequest<any>("GET", `/crm/v3/objects/calls/${callId}?properties=hs_call_title,hs_call_body,hs_call_direction,hs_timestamp,hs_call_duration`);
        engagements.push({
          id: String(callId),
          type: "call",
          direction: call.properties?.hs_call_direction || "UNKNOWN",
          subject: call.properties?.hs_call_title || "Call",
          body: (call.properties?.hs_call_body || "").substring(0, 500),
          timestamp: call.properties?.hs_timestamp,
          duration: call.properties?.hs_call_duration
        });
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  try {
    const notesRes = await hubspotRequest<any>("GET", `/crm/v4/objects/deals/${dealId}/associations/notes`);
    const noteIds = notesRes.results?.map((r: any) => r.toObjectId) || [];

    for (const noteId of noteIds) {
      try {
        const note = await hubspotRequest<any>("GET", `/crm/v3/objects/notes/${noteId}?properties=hs_note_body,hs_timestamp`);
        engagements.push({
          id: String(noteId),
          type: "note",
          direction: "INTERNAL",
          subject: "Note",
          body: (note.properties?.hs_note_body || "").substring(0, 500),
          timestamp: note.properties?.hs_timestamp
        });
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return engagements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
