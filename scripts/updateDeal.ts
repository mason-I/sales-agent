#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "221578086905";

// Update deal with captured pain point
// Q2 implementation - approximate mid-April 2025
const q2Timestamp = new Date('2025-04-15T00:00:00Z').getTime();

const properties = {
  sw_primary_pain: "First-contact resolution - too many escalations and handoffs between agents killing response times",
  timeline_for_change: String(q2Timestamp)
};

const result = await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties });
console.log("Deal updated:", JSON.stringify(result, null, 2));
