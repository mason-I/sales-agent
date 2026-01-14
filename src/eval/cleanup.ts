/**
 * HubSpot Cleanup Utility
 *
 * Post-evaluation cleanup that deletes test entities from HubSpot sandbox.
 * Uses tracked entity IDs from conversation results for precise cleanup.
 */

import { loadConversationResults, loadEvalRunConfig } from "./runNoteEnhancer";
import { hubspotRequest } from "../lib/hubspot";
import type { TrackedEntities } from "./types";

// =============================================================================
// Types
// =============================================================================

type CleanupResult = {
  runId: string;
  cleanedAt: string;
  totalConversations: number;
  deleted: {
    engagements: number;
    tasks: number;
    notes: number;
    deals: number;
    contacts: number;
  };
  errors: string[];
  dryRun: boolean;
};

type CleanupOptions = {
  dryRun?: boolean;
  logProgress?: boolean;
  batchSize?: number;
  delayMs?: number;
};

// =============================================================================
// Delete Functions
// =============================================================================

async function deleteEngagement(engagementId: string): Promise<boolean> {
  try {
    await hubspotRequest("DELETE", `/crm/v3/objects/emails/${engagementId}`);
    return true;
  } catch (error: any) {
    // Try legacy endpoint
    try {
      await hubspotRequest("DELETE", `/engagements/v1/engagements/${engagementId}`);
      return true;
    } catch {
      return false;
    }
  }
}

async function deleteTask(taskId: string): Promise<boolean> {
  try {
    await hubspotRequest("DELETE", `/crm/v3/objects/tasks/${taskId}`);
    return true;
  } catch {
    return false;
  }
}

async function deleteNote(noteId: string): Promise<boolean> {
  try {
    await hubspotRequest("DELETE", `/crm/v3/objects/notes/${noteId}`);
    return true;
  } catch {
    return false;
  }
}

async function deleteDeal(dealId: string): Promise<boolean> {
  try {
    await hubspotRequest("DELETE", `/crm/v3/objects/deals/${dealId}`);
    return true;
  } catch {
    return false;
  }
}

async function deleteContact(contactId: string): Promise<boolean> {
  try {
    await hubspotRequest("DELETE", `/crm/v3/objects/contacts/${contactId}`);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Batch Cleanup with Rate Limiting
// =============================================================================

async function batchDelete<T>(
  items: T[],
  deleteFn: (item: T) => Promise<boolean>,
  options: CleanupOptions,
  itemType: string
): Promise<{ deleted: number; errors: string[] }> {
  const batchSize = options.batchSize || 10;
  const delayMs = options.delayMs || 100;
  let deleted = 0;
  const errors: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    if (options.dryRun) {
      deleted += batch.length;
      if (options.logProgress) {
        console.log(`[DRY RUN] Would delete ${batch.length} ${itemType}(s)`);
      }
    } else {
      const results = await Promise.allSettled(batch.map(deleteFn));

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          deleted++;
        } else {
          errors.push(`Failed to delete ${itemType} at index ${i + j}`);
        }
      }

      if (options.logProgress) {
        console.log(`Deleted ${deleted}/${items.length} ${itemType}(s)`);
      }
    }

    // Rate limiting delay between batches
    if (i + batchSize < items.length && !options.dryRun) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { deleted, errors };
}

// =============================================================================
// Cleanup Single Conversation
// =============================================================================

async function cleanupConversation(
  entities: TrackedEntities,
  options: CleanupOptions
): Promise<{ deleted: CleanupResult["deleted"]; errors: string[] }> {
  const deleted = {
    engagements: 0,
    tasks: 0,
    notes: 0,
    deals: 0,
    contacts: 0
  };
  const errors: string[] = [];

  // 1. Delete engagements first (attached to deal)
  if (entities.engagementIds.length > 0) {
    const result = await batchDelete(
      entities.engagementIds,
      deleteEngagement,
      { ...options, logProgress: false },
      "engagement"
    );
    deleted.engagements = result.deleted;
    errors.push(...result.errors);
  }

  // 2. Delete tasks (attached to deal)
  if (entities.taskIds.length > 0) {
    const result = await batchDelete(
      entities.taskIds,
      deleteTask,
      { ...options, logProgress: false },
      "task"
    );
    deleted.tasks = result.deleted;
    errors.push(...result.errors);
  }

  // 3. Delete notes (attached to deal)
  if (entities.noteIds.length > 0) {
    const result = await batchDelete(
      entities.noteIds,
      deleteNote,
      { ...options, logProgress: false },
      "note"
    );
    deleted.notes = result.deleted;
    errors.push(...result.errors);
  }

  // 4. Delete deal (attached to contact)
  if (entities.dealId) {
    if (options.dryRun) {
      deleted.deals = 1;
    } else {
      const success = await deleteDeal(entities.dealId);
      if (success) {
        deleted.deals = 1;
      } else {
        errors.push(`Failed to delete deal ${entities.dealId}`);
      }
    }
  }

  // 5. Delete contact
  if (entities.contactId) {
    if (options.dryRun) {
      deleted.contacts = 1;
    } else {
      const success = await deleteContact(entities.contactId);
      if (success) {
        deleted.contacts = 1;
      } else {
        errors.push(`Failed to delete contact ${entities.contactId}`);
      }
    }
  }

  return { deleted, errors };
}

// =============================================================================
// Fallback: Pattern-Based Cleanup
// =============================================================================

async function findOrphanedContacts(runId: string): Promise<string[]> {
  const runPattern = `-${runId}-`;

  try {
    // Search for contacts that include the run ID in the email address
    const result = await hubspotRequest<any>("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "CONTAINS_TOKEN",
              value: runId
            }
          ]
        }
      ],
      properties: ["email"],
      limit: 100
    });

    const contacts = result.results || [];

    // Filter to those matching our run ID pattern
    return contacts
      .filter((c: any) => c.properties?.email?.includes(runPattern))
      .map((c: any) => c.id);
  } catch {
    return [];
  }
}

async function getDealsForContact(contactId: string): Promise<string[]> {
  try {
    const result = await hubspotRequest<any>(
      "GET",
      `/crm/v4/objects/contacts/${contactId}/associations/deals?limit=100`
    );
    return (result.results || []).map((r: any) => r.toObjectId);
  } catch {
    return [];
  }
}

async function getEngagementsForDeal(dealId: string): Promise<string[]> {
  try {
    const result = await hubspotRequest<any>(
      "GET",
      `/crm/v4/objects/deals/${dealId}/associations/emails?limit=100`
    );
    return (result.results || []).map((r: any) => r.toObjectId);
  } catch {
    return [];
  }
}

async function cleanupOrphanedEntities(
  runId: string,
  options: CleanupOptions
): Promise<{ deleted: CleanupResult["deleted"]; errors: string[] }> {
  const deleted = {
    engagements: 0,
    tasks: 0,
    notes: 0,
    deals: 0,
    contacts: 0
  };
  const errors: string[] = [];

  if (options.logProgress) {
    console.log("Searching for orphaned entities...");
  }

  const orphanedContactIds = await findOrphanedContacts(runId);

  if (orphanedContactIds.length === 0) {
    if (options.logProgress) {
      console.log("No orphaned contacts found.");
    }
    return { deleted, errors };
  }

  if (options.logProgress) {
    console.log(`Found ${orphanedContactIds.length} orphaned contacts`);
  }

  for (const contactId of orphanedContactIds) {
    // Get associated deals
    const dealIds = await getDealsForContact(contactId);

    for (const dealId of dealIds) {
      // Get and delete engagements
      const engagementIds = await getEngagementsForDeal(dealId);
      for (const engId of engagementIds) {
        if (options.dryRun) {
          deleted.engagements++;
        } else if (await deleteEngagement(engId)) {
          deleted.engagements++;
        }
      }

      // Delete deal
      if (options.dryRun) {
        deleted.deals++;
      } else if (await deleteDeal(dealId)) {
        deleted.deals++;
      }
    }

    // Delete contact
    if (options.dryRun) {
      deleted.contacts++;
    } else if (await deleteContact(contactId)) {
      deleted.contacts++;
    }

    // Rate limiting
    if (!options.dryRun) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { deleted, errors };
}

// =============================================================================
// Main Cleanup Entry Point
// =============================================================================

/**
 * Clean up all HubSpot entities created during an eval run
 */
export async function cleanupEvalRun(
  runId: string,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const config = loadEvalRunConfig(runId);
  if (!config) {
    throw new Error(`No config found for run: ${runId}`);
  }

  const results = loadConversationResults(runId);

  if (options.logProgress) {
    console.log(`\nCleaning up eval run: ${runId}`);
    console.log(`Conversations: ${results.length}`);
    console.log(`Mode: ${options.dryRun ? "DRY RUN" : "LIVE"}`);
    console.log("");
  }

  const totalDeleted = {
    engagements: 0,
    tasks: 0,
    notes: 0,
    deals: 0,
    contacts: 0
  };
  const allErrors: string[] = [];

  // Phase 1: Clean up tracked entities
  if (options.logProgress) {
    console.log("Phase 1: Cleaning up tracked entities...");
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (options.logProgress) {
      console.log(`[${i + 1}/${results.length}] Cleaning ${result.conversationId}...`);
    }

    const { deleted, errors } = await cleanupConversation(result.entities, options);

    totalDeleted.engagements += deleted.engagements;
    totalDeleted.tasks += deleted.tasks;
    totalDeleted.notes += deleted.notes;
    totalDeleted.deals += deleted.deals;
    totalDeleted.contacts += deleted.contacts;
    allErrors.push(...errors);
  }

  // Phase 2: Clean up any orphaned entities (fallback)
  if (options.logProgress) {
    console.log("\nPhase 2: Cleaning up orphaned entities...");
  }

  const orphanResult = await cleanupOrphanedEntities(runId, options);
  totalDeleted.engagements += orphanResult.deleted.engagements;
  totalDeleted.tasks += orphanResult.deleted.tasks;
  totalDeleted.notes += orphanResult.deleted.notes;
  totalDeleted.deals += orphanResult.deleted.deals;
  totalDeleted.contacts += orphanResult.deleted.contacts;
  allErrors.push(...orphanResult.errors);

  const cleanupResult: CleanupResult = {
    runId,
    cleanedAt: new Date().toISOString(),
    totalConversations: results.length,
    deleted: totalDeleted,
    errors: allErrors,
    dryRun: options.dryRun || false
  };

  if (options.logProgress) {
    console.log("\n=== Cleanup Summary ===");
    console.log(`Engagements deleted: ${totalDeleted.engagements}`);
    console.log(`Tasks deleted: ${totalDeleted.tasks}`);
    console.log(`Notes deleted: ${totalDeleted.notes}`);
    console.log(`Deals deleted: ${totalDeleted.deals}`);
    console.log(`Contacts deleted: ${totalDeleted.contacts}`);
    if (allErrors.length > 0) {
      console.log(`Errors: ${allErrors.length}`);
    }
    if (options.dryRun) {
      console.log("\n(This was a dry run - no actual deletions occurred)");
    }
  }

  return cleanupResult;
}
