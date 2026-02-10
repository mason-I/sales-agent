#!/usr/bin/env bun
import { logEmailEngagement } from "../src/lib/hubspot.ts";

const dealId = "231026931162";
const contactId = "281529047485";

const subject = "Re: Need to replace our current support platform ASAP";

const bodyParts = {
    intro: "Hi Priya,\n\nGreat to hear the pricing works! Once your finance team approves, you can purchase directly from your account with credit card or PayPal, or we can set you up to pay via invoice.\n\nOnboarding is primarily self-serve with the Professional plan—Zendesk is designed to work out of the box. You'll have access to our Help Center (support.zendesk.com), on-demand training at training.zendesk.com, and 24/7 online support. For your urgency situation, we also offer paid Professional Services for hands-on configuration and faster implementation if you need dedicated setup assistance.",
    questions: [],
    closing: "Let me know once finance approves and I can ensure a smooth handoff. We can get you up and running quickly given your timeline."
};

const intro = String(bodyParts.intro || "").trim();
const closing = String(bodyParts.closing || "").trim();
const questions = Array.isArray(bodyParts.questions)
    ? bodyParts.questions.map((q) => String(q).trim()).filter(Boolean)
    : [];

const normalizedQuestions = questions.slice(0, 3).map((q) => (q.endsWith("?") ? q : `${q}?`));
const questionLines = normalizedQuestions.map((q, i) => `${i + 1}) ${q}`).join("\n");

let body = [intro, questionLines, closing].filter(Boolean).join("\n\n");
if (!/zendesk/i.test(body)) {
    body = `${body}\n\nZendesk`;
}

console.log("Subject:", subject);
console.log("\nBody:", body);

// Log the email
const result = await logEmailEngagement(
  {
    subject,
    body,
    fromEmail: "sales@zendesk.com",
    fromName: "Zendesk",
    toEmail: "priya.sharma-7de28167-0@eval-858689.com",
    direction: "EMAIL"
  },
  contactId,
  dealId
);

console.log("\nEmail draft logged successfully!");
console.log("Email ID:", result.id);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
