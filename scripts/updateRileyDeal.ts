#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const dealId = "222852280814";

const properties = {
  amount: "34500",
  sw_primary_pain: "Fragmented support setup - need email, chat, and social unified in one place",
  agents_required: "25",
  support_channels: "email;web_and_mobile_messaging;social_messaging",
  ticket_volume_per_month: "4000",
  timeline_for_change: String(new Date("2025-03-01").getTime())
};

const result = await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties });
console.log("Deal updated:", JSON.stringify(result, null, 2));
