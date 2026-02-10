import { hubspotRequest } from '../src/lib/hubspot.js';

// Get deal associations to find contact
const dealAssociations = await hubspotRequest<any>('GET', '/crm/v3/objects/deals/234309086693/associations/contacts');
console.log(JSON.stringify(dealAssociations, null, 2));
