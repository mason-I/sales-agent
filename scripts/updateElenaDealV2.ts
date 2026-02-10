import { hubspotRequest } from "../src/lib/hubspot";

const dealId = "230905683390";

async function updateDeal() {
  const updates = {
    sw_primary_pain: "Scattered customer inquiries across email and social media, inconsistent response times as team grows",
    agents_required: "8",
    ticket_volume_per_month: "600"
  };

  await hubspotRequest(
    "PATCH",
    `/crm/v3/objects/deals/${dealId}`,
    { properties: updates }
  );

  console.log("Deal updated successfully");
  console.log(JSON.stringify(updates, null, 2));
}

updateDeal().catch(console.error);
