#!/usr/bin/env bun
import { logEmailEngagement } from "../src/lib/hubspot.ts";

const dealId = "231255928292";
const contactId = "281292042709";

console.log("Contact ID:", contactId);

const subject = "Re: Quick question - Fixing your AI routing and adding self-service";

const body = `Great questions, Priya. Let me address each one:

**1. AI misrouting causes and fixes**

The AI misrouting you're experiencing is typically caused by:
- **Insufficient training data**: The AI needs historical ticket data to learn accurate routing patterns
- **Unclear intent classification**: Ticket subjects/descriptions may be ambiguous without proper context
- **Outdated business rules**: Static routing rules that don't adapt to changing ticket types

Zendesk AI uses intent detection, language detection, and sentiment analysis to automatically classify and route tickets. With proper configuration, it saves ~45 seconds per ticket vs manual triage. The fix involves ensuring your AI is trained on your actual ticket data and configuring intelligent views and triggers for fallback handling.

**2. Self-service (Zendesk Guide/Help Center)**

Yes - Zendesk has a modern help center comparable to Intercom. Key features:
- **AI-powered bots** that suggest relevant articles and deflect tickets
- **Generative search** - customers ask questions and get AI-generated answers with article links
- **Web Widget/Mobile SDK** for in-context self-service anywhere on your site or app
- **Community forums** for peer-to-peer support
- **Knowledge management** with Team Publishing collaboration workflows

You can even use generative AI to auto-create help center content from your last 30 days of ticket data.

**3. Tier requirements**

For both AI intelligent routing and the self-service help center:
- **Suite Professional** ($115/agent/month) includes Guide (Help Center), AI-powered bots, and intelligent triage
- With 25 agents and your $30-50k budget, you have room for AI add-ons like Advanced AI Agents for automated resolutions

This directly addresses your three challenges: AI routing accuracy, CSAT improvement (through self-service), and giving customers an option to find answers on their own.

One quick question to finalize scope: What support channels are your customers using today (email, chat, phone, social)?

Zendesk`;

console.log("Subject:", subject);
console.log("\nBody:", body.substring(0, 200) + "...");

// Log the email
const result = await logEmailEngagement(
  {
    subject,
    body,
    fromEmail: "sales@zendesk.com",
    fromName: "Zendesk",
    toEmail: "priya.okonkwo@horizonventures.com",
    direction: "EMAIL"
  },
  contactId,
  dealId
);

console.log("\nEmail draft logged successfully!");
console.log("Email ID:", result.id);
console.log("Contact ID:", contactId);
console.log("Deal ID:", dealId);
