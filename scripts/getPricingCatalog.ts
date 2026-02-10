import hubspot from "@hubspot/api-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use HubSpot token from environment
const hubspotToken = process.env.HUBSPOT_PRIVATE_TOKEN;
if (!hubspotToken) {
  throw new Error("HUBSPOT_PRIVATE_TOKEN not found in environment");
}
const client = new hubspot.Client({ accessToken: hubspotToken });

async function getPricing() {
  const response = await client.crm.lineItems.searchApi.doSearch({
    filterGroups: [{ filters: [{ propertyName: "hs_product_id", operator: "HAS_PROPERTY" }] }],
    properties: ["name", "price", "hs_sku", "hs_product_id", "description"],
    limit: 100
  });

  const products = {};
  response.results.forEach(item => {
    const sku = item.properties.hs_sku || "unknown";
    const name = item.properties.name;
    const price = item.properties.price;
    const productId = item.properties.hs_product_id;
    const description = item.properties.description;

    if (!products[sku]) {
      products[sku] = { name, price, productId, description, variations: [] };
    }
    products[sku].variations.push({ price, name, description });
  });

  console.log(JSON.stringify(products, null, 2));
}

getPricing().catch(console.error);
