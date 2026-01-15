#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

// Find the product by SKU
const body = {
  filterGroups: [
    {
      filters: [
        {
          propertyName: 'hs_sku',
          operator: 'EQ',
          value: 'ZD-SUITE-PROFESSIONAL'
        }
      ]
    }
  ],
  properties: ['name', 'price', 'hs_sku'],
  limit: 1
};

const result = await hubspotRequest('POST', '/crm/v3/objects/products/search', body);
console.log(JSON.stringify(result, null, 2));
