import { hubspotRequest } from "../src/lib/hubspot.ts";

async function main() {

    const contactId = "281292042709";
    const dealId = "231298774497";
    const subject = "Re: Quick question";

    const bodyParts = {
        intro: "Thanks for confirming the agent count, Priya. I understand the urgency—let's get this moving.",
        questions: [
            "So I can finalize your quote, which support channels are priority for your team? (All Zendesk Suite tiers include email, voice, SMS, live chat, and social messaging—I just want to confirm what your 50+ agents will be using day-to-day)"
        ],
        closing: "For your size and urgency, I recommend **Suite Professional** ($115/agent/month). It gives you unlimited AI-powered answers, SLA management, skills-based routing, and custom reporting—critical for scaling 50+ agents quickly without chaos.\n\n**Fastest timeline**: Once you sign, basic setup is typically 3-5 business days. We provision your account, configure ticket views and automations, set up your help center, and run agent training. Your team can be taking tickets within a week.\n\nHere's your formal quote: https://442479746.hs-sites-ap1.com/ZWaMhFOrLHnHbso8U8UnVg\n\nIf your actual agent count is higher than 50, let me know and I'll adjust immediately."
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

    console.log("Email body:\n", body);

    const emailProperties = {
        hs_email_direction: "EMAIL",
        hs_email_status: "SENT",
        hs_email_subject: subject,
        hs_email_text: body,
        hs_timestamp: new Date().toISOString()
    };

    const created = await hubspotRequest("POST", "/crm/v3/objects/emails", { properties: emailProperties });
    const emailId = created.id;
    console.log("\nEmail created:", emailId);

    await hubspotRequest(
        "PUT",
        `/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`,
        [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }]
    );
    console.log("Associated to contact");

    await hubspotRequest(
        "PUT",
        `/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`,
        [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 210 }]
    );
    console.log("Associated to deal");
}

main().catch(console.error);
