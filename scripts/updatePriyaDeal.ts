import { hubspotRequest } from "../src/lib/hubspot.ts";

const dealId = "231298774497";

// Update deal with confirmed agent count
await hubspotRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, {
  properties: {
    agents_required: "50"
  }
});
console.log("Updated deal with agents_required=50");
