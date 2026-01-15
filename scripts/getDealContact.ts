#!/usr/bin/env bun
import { fetchDealAssociations } from "../src/lib/hubspot.ts";

const deals = await fetchDealAssociations("221578086905", "contact");
console.log(JSON.stringify(deals, null, 2));
