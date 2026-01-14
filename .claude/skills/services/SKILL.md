---
name: services-invoicing
description: Create a quote/package by attaching Zendesk plan + add-on line items in HubSpot, then create a draft invoice (used as the quote). Use when a deal is ready for pricing.
required-tools:
  - crm_createLineItemsForDeal
  - crm_createDraftInvoice
---

# Quotes & Packaging (Line Items + Invoice-as-Quote)

Use this skill to create a **quote package** by attaching HubSpot line items to a deal, then generate a **draft invoice** that serves as the quote in HubSpot.

## Prerequisites
- Deal is ready for a pricing package (discovery complete).
- You have selected **plan + add-ons** and quantities.
- Use SKUs from `data/zendesk-products.json`.

## Steps

1. Select the plan + add-ons and quantities.
2. Call the tool `crm_createLineItemsForDeal` with the SKUs and quantities.
3. Use the returned line item IDs and call `crm_createDraftInvoice` to create the draft invoice (quote).

## Output
- Quote step returns line item IDs and SKUs.
- Invoice step returns the draft invoice ID and link.

## Notes
- Invoices are used as quotes in HubSpot.
- Quote creation (line items) and invoice creation both require the Requirement Scoping gate to be satisfied.
- If an SKU is missing from HubSpot, sync the product catalog first.
- Do not invent implementation/service SKUs. Use **only** SKUs present in `data/zendesk-products.json`.
- Always pick **a Suite plan SKU** plus any required add-ons from the allowed list in `plan-recommendation`.
