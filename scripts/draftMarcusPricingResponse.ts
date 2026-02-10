/**
 * Draft email response to Marcus about pricing channels
 */

import { createDealNote } from "../src/lib/hubspot";

async function draftResponse() {
  const dealId = "230850084322";
  const contactId = "282018485697";

  const subject = "Re: Quick question";

  const bodyParts = {
    intro: `Hi Marcus,

Glad to hear that—that's exactly the kind of problem Zendesk is built to solve.

I want to make sure I quote you accurately. The $1,824 figure ($152/month for 8 agents) is for our **Support Team plan**, which covers ticketing and email support.

If you need additional channels like live chat, messaging (social/web), or voice, you'd want our **Suite Team plan**, which starts at $55/agent/month, or roughly $5,280 annually for your team.

So I can get you the right numbers, what support channels are you looking to use beyond email?`,
    questions: [],
    closing: `Thanks,

Zendesk`
  };

  const body = [bodyParts.intro, ...bodyParts.questions, bodyParts.closing].filter(Boolean).join("\n\n");

  console.log("Subject:", subject);
  console.log("\nBody:");
  console.log("---");
  console.log(body);
  console.log("---");

  await createDealNote(dealId, `EMAIL DRAFT\n\nTo: Contact ${contactId}\nSubject: ${subject}\n\n${body}`);

  console.log("\n✓ Logged to HubSpot");
}

draftResponse().catch(console.error);
