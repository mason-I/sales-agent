import { updateDealSummary } from "../src/runtime/summary";

const dealId = process.argv[2];
const summaryJson = process.argv[3];

if (!dealId || !summaryJson) {
  console.error("Usage: tsx updateFatimaSummary.ts <dealId> <summaryJson>");
  process.exit(1);
}

const summary = JSON.parse(summaryJson);
await updateDealSummary(dealId, summary);
console.log("Deal summary updated successfully");
