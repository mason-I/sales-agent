#!/usr/bin/env bun
import { hubspotRequest } from "../src/lib/hubspot.js";

const dealId = "230905683390";

// Update deal with qualification data from Elena's email
await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
  properties: {
    // Pain admitted: scattered inquiries, inconsistent response times
    sw_primary_pain: "Scattered customer inquiries across email and social media, inconsistent response times as team has grown",
    // Key challenges: scattered channels, response time consistency
    key_challenges: "Managing inquiries across multiple channels (email, social media); maintaining consistent response times with growing volume",
    // Sizing info
    agents_required: "8",
    ticket_volume_per_month: "600",
    // Support channels - mentioned email and social media
    support_channels: "email; social_messaging",
    // Budget - 8 agents x $19 x 12 months = $1,824 annually (well under $5k target)
    amount: "1824"
  }
});

console.log("Deal updated successfully with qualification data!");
