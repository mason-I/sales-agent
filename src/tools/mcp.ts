import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";
import { hubspotRequest, updateTask, createTask, updateContact, createDealNote, getContactAssociations, fetchDealEngagements, fetchTask, fetchDealProperties } from "../lib/hubspot";
import { STAGE_ORDER } from "../config/dealStage";

const productCatalogPath = resolve(process.cwd(), "data", "zendesk-products.json");
let PRODUCT_CATALOG: { currency: string; products: Array<{ sku: string }> } = { currency: "USD", products: [] };
try {
  const raw = readFileSync(productCatalogPath, "utf-8");
  PRODUCT_CATALOG = JSON.parse(raw);
} catch {
  // ignore missing catalog
}
const ALLOWED_SKUS = new Set((PRODUCT_CATALOG.products || []).map((p) => p.sku));

function normalizeSku(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveSku(input: string) {
  if (ALLOWED_SKUS.has(input)) return input;
  const normalized = normalizeSku(input);
  for (const sku of ALLOWED_SKUS) {
    const candidate = normalizeSku(sku);
    if (candidate === normalized || candidate.endsWith(normalized)) {
      return sku;
    }
  }
  return null;
}

function asNonEmptyTuple<T extends string>(values: T[], label: string): [T, ...T[]] {
  if (values.length === 0) {
    throw new Error(`${label} must include at least one value`);
  }
  return values as [T, ...T[]];
}

const DEAL_STAGE_IDS = asNonEmptyTuple([...STAGE_ORDER, "closedlost"], "DEAL_STAGE_IDS");

const SUPPORT_CHANNEL_IDS = [
  "email",
  "help_center",
  "web_and_mobile_messaging",
  "social_messaging",
  "voice",
  "text",
  "live_chat",
  "web_widget_classic",
  "mobile_sdk",
  "api",
  "channel_integrations",
  "computer_telephony_integration",
  "closed_tickets"
] as const;


async function findProductBySku(sku: string) {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "hs_sku",
            operator: "EQ",
            value: sku
          }
        ]
      }
    ],
    properties: ["name", "price", "hs_sku"],
    limit: 1
  };

  const result = await hubspotRequest<any>("POST", "/crm/v3/objects/products/search", body);
  return result.results?.[0] || null;
}

async function createLineItemFromProduct(product: any, item: { sku: string; quantity: number }) {
  const quantity = Number(item.quantity || 1);

  const properties: Record<string, string> = {
    name: product.properties?.name || product.properties?.hs_sku || item.sku,
    quantity: String(quantity)
  };

  // Use catalog price only - no price overrides allowed
  if (product.properties?.price != null) {
    properties.price = String(product.properties.price);
  }

  if (product.id) properties.hs_product_id = product.id;
  return await hubspotRequest<any>("POST", "/crm/v3/objects/line_items", { properties });
}

async function associateLineItemToDeal(lineItemId: string, dealId: string) {
  const payload = [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 20
    }
  ];
  await hubspotRequest("PUT", `/crm/v4/objects/line_items/${lineItemId}/associations/deal/${dealId}`, payload);
}

async function addLineItemsToDeal(dealId: string, lineItemIds: string[]) {
  const results: Array<{ lineItemId: string; ok: boolean; error?: string }> = [];
  for (const lineItemId of lineItemIds) {
    try {
      await associateLineItemToDeal(lineItemId, dealId);
      results.push({ lineItemId, ok: true });
    } catch (error: any) {
      results.push({ lineItemId, ok: false, error: error.message });
    }
  }
  return results;
}

async function createInvoice(dealId: string, lineItemIds: string[], currency: string) {
  // Step 1: Create invoice in draft status (no associations at creation)
  const properties = {
    hs_currency: currency || "USD",
    hs_invoice_status: "draft"
  };

  const invoice = await hubspotRequest<any>("POST", "/crm/v3/objects/invoices", { properties });
  const invoiceId = invoice?.id;
  if (!invoiceId) {
    throw new Error("Invoice creation failed - no ID returned");
  }

  // Step 2: Use batch associations API for line items
  await hubspotRequest("POST", "/crm/v3/associations/line_item/invoice/batch/create", {
    inputs: lineItemIds.map((lineItemId) => ({
      from: { id: lineItemId },
      to: { id: invoiceId },
      type: "line_item_to_invoice"
    }))
  });

  // Step 3: Use batch associations API for deal
  await hubspotRequest("POST", "/crm/v3/associations/deal/invoice/batch/create", {
    inputs: [{
      from: { id: dealId },
      to: { id: invoiceId },
      type: "deal_to_invoice"
    }]
  });

  // Step 4: Update invoice to 'open' status to make it payable
  const updated = await hubspotRequest<any>("PATCH", `/crm/v3/objects/invoices/${invoiceId}`, {
    properties: { hs_invoice_status: "open" }
  });

  // Return the invoice with the URL
  return {
    ...invoice,
    properties: {
      ...invoice.properties,
      ...updated.properties
    }
  };
}

const ZENDESK_KB_DOMAINS = ["support.zendesk.com", "zendesk.com", "www.zendesk.com"];
const KB_SEARCH_TIMEOUT_MS = 20000;

function normalizeDomain(value?: string | null) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return new URL(trimmed).hostname;
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^https?:\/\//, "").split("/")[0];
}

async function searchZendeskKb(objective: string, maxResults = 10) {
  if (!process.env.PARALLEL_API_KEY) {
    throw new Error("PARALLEL_API_KEY environment variable is required");
  }

  const includeDomains = ZENDESK_KB_DOMAINS.map(normalizeDomain).filter(Boolean);

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = KB_SEARCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const params = {
    mode: "one-shot",
    max_results: maxResults,
    objective,
    search_queries: null,
    source_policy: { include_domains: includeDomains },
    betas: ["search-extract-2025-10-10"]
  };

  let result: any;
  try {
    const response = await fetchWithTimeout("https://api.parallel.ai/v1beta/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.PARALLEL_API_KEY,
        "parallel-beta": "search-extract-2025-10-10"
      },
      body: JSON.stringify({
        mode: params.mode,
        max_results: params.max_results,
        objective: params.objective,
        search_queries: params.search_queries,
        source_policy: params.source_policy
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    result = await response.json();
  } catch (error) {
    throw error;
  }

  const results = result?.results || [];
  if (results.length === 0) {
    return { status: "NOT_FOUND", answer: null, links: [], confidence: "low", reason: "No results returned." };
  }

  const links = results.map((r: any) => r.url).filter(Boolean).slice(0, 3);
  const excerpts = results
    .map((r: any) => r.extract || r.summary || r.snippet || "")
    .filter(Boolean)
    .slice(0, 3)
    .join("\n\n");

  return {
    status: "FOUND",
    answer: excerpts || null,
    links,
    confidence: "medium"
  };
}

export function createSalesMcpServer() {
  const server = createSdkMcpServer({
    name: "sales-crm",
    version: "1.0.0",
    tools: [
      tool(
        "crm_upsertContact",
        "Create or update a HubSpot contact by email. Requires email, firstname, lastname.",
        {
          email: z.string().email(),
          firstname: z.string().min(1),
          lastname: z.string().min(1)
        },
        async (input) => {
          try {
            const { email, ...rest } = input;
            const payload = {
              inputs: [{ id: email, idProperty: "email", properties: rest }]
            };
            const result = await hubspotRequest<any>("POST", "/crm/v3/objects/contacts/batch/upsert", payload);
            const contactId = result?.results?.[0]?.id || result?.id || null;
            if (!contactId) {
              return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Contact upsert succeeded but no contact ID returned." }) }] };
            }
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: { contactId, result } }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_logEmailDraft",
        "Create a HubSpot email record and associate it with a contact and deal. Requires structured bodyParts with 0-3 questions (0 is valid).",
        {
          contactId: z.string().min(1).optional(),
          dealId: z.string().min(1),
          subject: z.string().min(1).max(200),
          bodyParts: z.object({
            intro: z.string().min(1),
            questions: z.array(z.string().min(1)).min(0).max(3),
            closing: z.string().min(1)
          })
        },
        async ({ contactId, dealId, subject, bodyParts }) => {
          const intro = String(bodyParts.intro || "").trim();
          const closing = String(bodyParts.closing || "").trim();
          const questions = Array.isArray(bodyParts.questions)
            ? bodyParts.questions.map((q) => String(q).trim()).filter(Boolean)
            : [];

          const warnings: Array<{ policy: string; message: string }> = [];
          if (intro.includes("?") || closing.includes("?")) {
            warnings.push({ policy: "QUESTION_PLACEMENT", message: "Questions should be in the questions array only." });
          }

          const normalizedQuestions = questions.slice(0, 3).map((q) => (q.endsWith("?") ? q : `${q}?`));
          const questionLines = normalizedQuestions.map((q, i) => `${i + 1}) ${q}`).join("\n");

          let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
          if (!body.toLowerCase().includes("zendesk")) {
            body = `${body}\n\nZendesk`;
          }

          // Note: Async-only policy is handled by hooks with auto-correction.
          // We only add a warning here for observability, not blocking.

          try {
            const emailProperties = {
              hs_email_direction: "EMAIL",
              hs_email_status: "SENT",
              hs_email_subject: subject,
              hs_email_text: body,
              hs_timestamp: new Date().toISOString()
            };

            const created = await hubspotRequest<any>("POST", "/crm/v3/objects/emails", { properties: emailProperties });
            const emailId = created.id;
            if (!emailId) {
              return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Email creation failed (no ID returned)." }) }] };
            }

            await hubspotRequest(
              "PUT",
              `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
              [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
            );

            await hubspotRequest(
              "PUT",
              `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
              [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, data: { emailId, contactId, dealId }, warnings })
                }
              ]
            };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message, warnings }) }] };
          }
        }
      ),
      tool(
        "crm_createLineItemsForDeal",
        "Create HubSpot line items from SKUs and associate them to a deal. Uses SKU allowlist and catalog pricing only.",
        {
          dealId: z.string().min(1),
          items: z.array(
            z.object({
              sku: z.string().min(1),
              quantity: z.number().int().positive()
              // No price override - catalog price only (no discounts allowed)
            })
          ).min(1)
        },
        async ({ dealId, items }) => {
          try {
            const created: Array<{ sku: string; lineItemId?: string; ok: boolean; error?: string }> = [];
            let totalAmount = 0;
            for (const item of items) {
              const resolvedSku = resolveSku(item.sku);
              if (!resolvedSku) {
                created.push({ sku: item.sku, ok: false, error: "SKU not in allowlist" });
                continue;
              }
              const product = await findProductBySku(resolvedSku);
              if (!product) {
                created.push({ sku: resolvedSku, ok: false, error: "SKU not found in HubSpot catalog" });
                continue;
              }
              const lineItem = await createLineItemFromProduct(product, { ...item, sku: resolvedSku });
              if (lineItem?.id) {
                created.push({ sku: resolvedSku, lineItemId: lineItem.id, ok: true });
                const priceValue = Number(product?.properties?.price);
                const quantityValue = Number(item.quantity || 1);
                if (!Number.isNaN(priceValue) && !Number.isNaN(quantityValue)) {
                  totalAmount += priceValue * quantityValue;
                }
              } else {
                created.push({ sku: resolvedSku, ok: false, error: "Line item creation failed" });
              }
            }

            const lineItemIds = created.filter((c) => c.ok && c.lineItemId).map((c) => c.lineItemId as string);
            const associations = lineItemIds.length > 0 ? await addLineItemsToDeal(dealId, lineItemIds) : [];

            let amountUpdated = false;
            if (totalAmount > 0) {
              try {
                await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
                  properties: { amount: String(Math.round(totalAmount * 100) / 100) }
                });
                amountUpdated = true;
              } catch {
                amountUpdated = false;
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, data: { created, associations, amountUpdated, amount: totalAmount } })
                }
              ]
            };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_createDraftInvoice",
        "Create an invoice for a deal and line items. Invoice is immediately payable (no human review).",
        {
          dealId: z.string().min(1),
          lineItemIds: z.array(z.string().min(1)).min(1)
        },
        async ({ dealId, lineItemIds }) => {
          try {
            const invoice = await createInvoice(dealId, lineItemIds, PRODUCT_CATALOG.currency || "USD");
            const invoiceId = invoice?.id;
            const invoiceLink = invoice?.properties?.hs_invoice_url || invoice?.properties?.hs_invoice_link || "";
            if (!invoiceId) {
              try {
                await createDealNote(dealId, `Invoice creation failed: no invoice ID returned. Line items: ${lineItemIds.join(", ")}`);
              } catch {
                // ignore note failure
              }
              return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Invoice creation failed" }) }] };
            }

            // Invoice is immediately payable - no review task needed
            // Agent should include invoiceLink in email to customer
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ ok: true, data: { invoiceId, invoiceLink } })
                }
              ]
            };
          } catch (error: any) {
            try {
              await createDealNote(dealId, `Invoice creation failed: ${error.message || error}`);
            } catch {
              // ignore note failure
            }
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "kb_searchZendesk",
        "Search Zendesk-owned sources for product functionality. Returns FOUND/NOT_FOUND.",
        {
          objective: z.string().min(1),
          maxResults: z.number().int().positive().max(20).optional()
        },
        async ({ objective, maxResults }) => {
          try {
            const result = await searchZendeskKb(objective, maxResults);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_updateDealProperties",
        "Update allowed HubSpot deal properties with strict types and enums. Use for qualification and stage updates.",
        {
          dealId: z.string().min(1),
          dealstage: z.enum(DEAL_STAGE_IDS).optional().describe("HubSpot deal stage ID"),
          dealname: z.string().optional().describe("Deal name"),
          sw_primary_pain: z.string().optional().describe("Primary pain point the customer is experiencing"),
          key_challenges: z.string().optional().describe("Specific obstacles or friction points increasing cost or time spent"),
          amount: z.number().optional().describe("Budget or amount (number, will be saved as string)"),
          timeline_for_change: z.number().int().optional().describe("Unix timestamp in milliseconds for desired change timeline"),
          agents_required: z.number().optional().describe("Number of support agents required"),
          support_channels: z.array(z.enum(SUPPORT_CHANNEL_IDS)).optional().describe("Support channels (canonical values)"),
          ticket_volume_per_month: z.number().optional().describe("Estimated ticket volume per month"),
          closed_lost_reason: z.string().optional().describe("Why the deal did not proceed and any key context"),
          session_id: z.string().optional().describe("Agent session ID used for resume"),
          last_processed: z.number().int().optional().describe("Unix ms timestamp for last dead-opportunity processing")
        },
        async ({
          dealId,
          dealstage,
          dealname,
          sw_primary_pain,
          key_challenges,
          amount,
          timeline_for_change,
          agents_required,
          support_channels,
          ticket_volume_per_month,
          closed_lost_reason,
          session_id,
          last_processed
        }) => {
          try {
            const properties: Record<string, string> = {};
            if (dealstage) properties.dealstage = dealstage;
            if (dealname) properties.dealname = dealname;
            if (sw_primary_pain) properties.sw_primary_pain = sw_primary_pain;
            if (key_challenges) properties.key_challenges = key_challenges;
            if (amount !== undefined && amount !== null) properties.amount = String(amount);
            if (timeline_for_change !== undefined && timeline_for_change !== null) {
              properties.timeline_for_change = String(Math.trunc(timeline_for_change));
            }
            if (agents_required !== undefined && agents_required !== null) {
              properties.agents_required = String(agents_required);
            }
            if (ticket_volume_per_month !== undefined && ticket_volume_per_month !== null) {
              properties.ticket_volume_per_month = String(ticket_volume_per_month);
            }
            if (closed_lost_reason) properties.closed_lost_reason = closed_lost_reason;
            if (session_id) properties.session_id = session_id;
            if (last_processed !== undefined && last_processed !== null) {
              properties.last_processed = String(Math.trunc(last_processed));
            }

            if (support_channels && support_channels.length > 0) {
              const existing = await fetchDealProperties(dealId, ["support_channels"]);
              const currentRaw = typeof existing.support_channels === "string" ? existing.support_channels : "";
              const current = currentRaw
                .split(";")
                .map((value: string) => value.trim())
                .filter(Boolean);
              const merged = Array.from(new Set([...current, ...support_channels]));
              if (merged.length > 0) {
                properties.support_channels = merged.join("; ");
              }
            }

            if (Object.keys(properties).length === 0) {
              return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "No properties provided to update" }) }] };
            }

            const result = await hubspotRequest<any>("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties });
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_updateContact",
        "Update properties for a specific HubSpot contact. Use this to persist learned contact info like job title, phone, or company size.",
        {
          contactId: z.string().min(1),
          properties: z.record(z.string(), z.string())
        },
        async ({ contactId, properties }) => {
          try {
            const result = await updateContact(contactId, properties);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_addDealNote",
        "Add an internal note to a HubSpot deal. Use this for observations, summaries, or research findings.",
        {
          dealId: z.string().min(1),
          body: z.string().min(1)
        },
        async ({ dealId, body }) => {
          try {
            const result = await createDealNote(dealId, body);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_createTask",
        "Create a general follow-up task in HubSpot associated with a deal. Use for reminders or action items.",
        {
          dealId: z.string().min(1),
          subject: z.string().min(1),
          body: z.string().optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
          dueDate: z.string().optional()
        },
        async ({ dealId, subject, body, priority, dueDate }) => {
          try {
            const properties: Record<string, string> = {
              hs_task_subject: subject,
              hs_task_body: body || "",
              hs_task_status: "NOT_STARTED",
              hs_task_priority: priority || "MEDIUM"
            };
            if (dueDate) properties.hs_timestamp = new Date(dueDate).getTime().toString();
            const associations = [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }] }];
            const result = await createTask(properties, associations);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_getContactDeals",
        "Get all deals associated with a specific contact. Use this to understand multi-product relationships.",
        {
          contactId: z.string().min(1)
        },
        async ({ contactId }) => {
          try {
            const result = await getContactAssociations(contactId, "deal");
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_getDealEngagements",
        "Fetch all engagements (emails, calls, notes) for a deal. Use this to dynamically load conversation history.",
        {
          dealId: z.string().min(1)
        },
        async ({ dealId }) => {
          try {
            const result = await fetchDealEngagements(dealId);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_getTask",
        "Get details of a specific HubSpot task by ID. Use this to check task status or instructions.",
        {
          taskId: z.string().min(1)
        },
        async ({ taskId }) => {
          try {
            const result = await fetchTask(taskId);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      ),
      tool(
        "crm_updateTask",
        "Update a HubSpot task (e.g., mark complete, change priority). Use this to manage task lifecycle.",
        {
          taskId: z.string().min(1),
          properties: z.record(z.string(), z.string())
        },
        async ({ taskId, properties }) => {
          try {
            const result = await updateTask(taskId, properties);
            return { content: [{ type: "text", text: JSON.stringify({ ok: true, data: result }) }] };
          } catch (error: any) {
            return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }) }] };
          }
        }
      )
    ]
  });

  const catalogUri = "zendesk://products/catalog";
  const pricingUri = "zendesk://pricing/catalog";
  const catalogPayload = JSON.stringify(PRODUCT_CATALOG || { currency: "USD", products: [] }, null, 2);

  try {
    server.instance.resource(
      "Zendesk Product Catalog",
      catalogUri,
      { description: "Zendesk pricing catalog (source of truth).", mimeType: "application/json" },
      async () => ({
        contents: [{ uri: catalogUri, mimeType: "application/json", text: catalogPayload }]
      })
    );
    server.instance.resource(
      "Zendesk Pricing Catalog",
      pricingUri,
      { description: "Alias for Zendesk pricing catalog.", mimeType: "application/json" },
      async () => ({
        contents: [{ uri: pricingUri, mimeType: "application/json", text: catalogPayload }]
      })
    );
  } catch {
    // Ignore duplicate resource registration
  }

  return server;
}
