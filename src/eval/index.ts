/**
 * Evaluation System
 *
 * Automated testing and evaluation for the sales agent.
 */

// Types
export * from "./types";

// Customer Simulator
export {
  generateInitialInquiry,
  generateCustomerResponse,
  generatePersonaInstance,
  selectPersonaTemplate
} from "./customerSimulator";

// Conversation Runner
export {
  runConversation,
  runConversationBatch
} from "./conversationRunner";

// Run Note Enhancer
export {
  saveEvalRunConfig,
  loadEvalRunConfig,
  saveConversationResult,
  loadConversationResults,
  loadTrackedEntities,
  generateEvalRunSummary,
  saveEvalRunSummary,
  loadEvalRunSummary
} from "./runNoteEnhancer";

// Evaluator
export {
  evaluateRun,
  loadEvaluationResult
} from "./evaluator";

// Cleanup
export {
  cleanupEvalRun
} from "./cleanup";
