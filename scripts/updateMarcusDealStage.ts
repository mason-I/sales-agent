#!/usr/bin/env bun
import { hubspotRequest } from '../src/lib/hubspot.ts';

const DEAL_ID = '231691771324';
const STAGE = '2388431315'; // Established Timeline

console.log(`Updating deal ${DEAL_ID} to stage: ${STAGE}`);
const result = await hubspotRequest('PATCH', `/crm/v3/objects/deals/${DEAL_ID}`, {
  properties: {
    dealstage: STAGE
  }
});
console.log('Deal updated:', result.id, 'Stage:', result.properties.dealstage);
