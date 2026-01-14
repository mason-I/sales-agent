function extractQuestions(text: string) {
  if (!text) return [];
  const matches = text.match(/[^?]+\?/g) || [];
  return matches
    .map((q) => q.trim())
    .filter((q) => q.endsWith("?"))
    .map((q) => q.replace(/\s{2,}/g, " ").trim());
}

function removeQuestionSentences(text: string) {
  if (!text) return "";
  return text.replace(/[^?]+\?/g, (match) => (match.trim().endsWith("?") ? "" : match)).replace(/\s{2,}/g, " ").trim();
}

function normalizeQuestions(questions: string[]) {
  return questions
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => (q.endsWith("?") ? q : `${q}?`));
}

export function autoCorrectDraftInput(input: any, defaults: { subject?: string; questions?: string[] } = {}) {
  const changes: string[] = [];
  const original = JSON.stringify(input || {});
  const updated = JSON.parse(JSON.stringify(input || {}));

  updated.subject = String(updated.subject || defaults.subject || "Quick follow-up").trim();
  if (!updated.subject) {
    updated.subject = "Quick follow-up";
    changes.push("subject_defaulted");
  }

  updated.bodyParts = updated.bodyParts || {};
  let intro = String(updated.bodyParts.intro || "").trim();
  let closing = String(updated.bodyParts.closing || "").trim();

  const introQuestions = extractQuestions(intro);
  const closingQuestions = extractQuestions(closing);
  if (introQuestions.length > 0 || closingQuestions.length > 0) {
    changes.push("questions_moved_from_intro_or_closing");
  }

  intro = removeQuestionSentences(intro);
  closing = removeQuestionSentences(closing);

  let questions = Array.isArray(updated.bodyParts.questions)
    ? updated.bodyParts.questions.map((q: any) => String(q || "")).filter(Boolean)
    : [];
  questions = normalizeQuestions([...questions, ...introQuestions, ...closingQuestions]);

  if (questions.length < 2) {
    const fallbacks = defaults.questions || [
      "How many agents will need access?",
      "Which channels matter most (email, chat, voice)?",
      "What does success look like for your team?"
    ];
    for (const fallback of fallbacks) {
      if (questions.length >= 2) break;
      questions.push(fallback);
    }
    changes.push("questions_defaulted");
  }

  if (questions.length > 3) {
    questions = questions.slice(0, 3);
    changes.push("questions_truncated");
  }

  updated.bodyParts.intro = intro;
  updated.bodyParts.closing = closing;
  updated.bodyParts.questions = questions;

  const updatedStr = JSON.stringify(updated);
  const changed = changes.length > 0 || updatedStr !== original;
  return { updated, changes, changed };
}

export function autoCorrectKbInput(input: any, fallbackObjective: string) {
  const original = JSON.stringify(input || {});
  const updated = { ...(input || {}) };
  const changes: string[] = [];
  if (!updated.objective || String(updated.objective).trim().length === 0) {
    updated.objective = fallbackObjective || "Verify Zendesk capability";
    changes.push("objective_defaulted");
  }
  if (!updated.maxResults) {
    updated.maxResults = 8;
    changes.push("maxResults_defaulted");
  }
  const updatedStr = JSON.stringify(updated);
  const changed = changes.length > 0 || updatedStr !== original;
  return { updated, changes, changed };
}
