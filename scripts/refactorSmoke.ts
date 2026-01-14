import { autoCorrectDraftInput, autoCorrectKbInput } from "../src/runtime/autoCorrect";
import { validateWorkitemsDeterministically } from "../src/runtime/judge";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testDraftAutoCorrection() {
  const input = {
    subject: "Let's schedule a call",
    bodyParts: {
      intro: "We can meet next week. What does success look like?",
      closing: "Thanks!"
    }
  };
  const { updated } = autoCorrectDraftInput(input);
  assert(!/call|meet/i.test(updated.subject), "Draft subject still contains call language.");
  assert(Array.isArray(updated.bodyParts.questions), "Draft questions missing.");
  assert(updated.bodyParts.questions.length >= 2, "Draft questions were not defaulted to 2+.");
}

function testKbAutoCorrection() {
  const { updated } = autoCorrectKbInput({ query: "agent workspace" }, "Verify Zendesk capability");
  assert(Boolean(updated.objective), "KB objective was not defaulted.");
  assert(Boolean(updated.maxResults), "KB maxResults was not defaulted.");
}

function testAsyncOnlyViolation() {
  const plan = {
    intent: "new",
    workitems: [
      {
        task: "Schedule a call",
        desc: "Set up a demo call.",
        justification: "Need to discuss requirements",
        skills: [],
        type: "internal_action",
        order: 1,
        dependsOn: [],
        outputsTo: null
      },
      {
        task: "Reply",
        desc: "Send summary",
        justification: "Close loop",
        skills: ["draft-reply"],
        type: "external_response",
        order: 2,
        dependsOn: [1],
        outputsTo: null
      }
    ]
  };
  const violations = validateWorkitemsDeterministically(plan, {});
  assert(violations.some((v) => v.code === "ASYNC_ONLY_VIOLATION"), "Expected async-only violation missing.");
}

function testZendeskSkillViolation() {
  const plan = {
    intent: "new",
    workitems: [
      {
        task: "Zendesk feature question",
        desc: "Does Zendesk support workflow triggers?",
        justification: "Need capability confirmation",
        skills: [],
        type: "internal_action",
        order: 1,
        dependsOn: [],
        outputsTo: 2
      },
      {
        task: "Reply",
        desc: "Send response",
        justification: "Close loop",
        skills: ["draft-reply"],
        type: "external_response",
        order: 2,
        dependsOn: [1],
        outputsTo: null
      }
    ]
  };
  const violations = validateWorkitemsDeterministically(plan, {});
  assert(violations.some((v) => v.code === "MISSING_ZENDESK_SKILL"), "Expected Zendesk skill violation missing.");
}

function main() {
  testDraftAutoCorrection();
  testKbAutoCorrection();
  testAsyncOnlyViolation();
  testZendeskSkillViolation();
  console.log("refactorSmoke: ok");
}

main();
