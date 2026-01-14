#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in project root
const projectRoot = resolve(__dirname, '../../../../');
const envPath = resolve(projectRoot, '.env');

if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

// HubSpot API configuration
const hubspotToken = process.env.HUBSPOT_PRIVATE_TOKEN || process.env.HUBSPOT_API_KEY;
const apiBase = process.env.HS_API_BASE || 'https://api.hubapi.com';

if (!hubspotToken) {
    throw new Error('HUBSPOT_PRIVATE_TOKEN or HUBSPOT_API_KEY environment variable is required');
}

/**
 * Log an email draft to HubSpot and associate it with a contact and deal
 * 
 * @param {Object} options
 * @param {string} options.contactId - HubSpot contact ID (required)
 * @param {string} options.dealId - HubSpot deal ID (required)
 * @param {string} options.subject - Email subject (required)
 * @param {string} options.body - Email body content (required)
 */
export default async function logEmail(options) {
    const {
        contactId,
        dealId,
        subject,
        body
    } = options;

    if (!contactId) {
        throw new Error('contactId is required');
    }
    if (!dealId) {
        throw new Error('dealId is required');
    }
    if (!subject) {
        throw new Error('subject is required');
    }
    if (!body) {
        throw new Error('body is required');
    }

    // Step 1: Create the email without associations
    const emailProperties = {
        hs_email_direction: 'EMAIL',
        hs_email_status: 'SENT',
        hs_email_subject: subject,
        hs_email_text: body,
        hs_timestamp: new Date().toISOString()
    };

    let emailId;
    try {
        const createResponse = await fetch(`${apiBase}/crm/v3/objects/emails`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${hubspotToken}`
            },
            body: JSON.stringify({ properties: emailProperties })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create email: ${createResponse.status} - ${errorText}`);
        }

        const emailResult = await createResponse.json();
        emailId = emailResult.id;
    } catch (error) {
        console.error('Failed to create email:', error.message);
        throw error;
    }

    // Step 2: Associate email with contact using v4 API
    try {
        await fetch(`${apiBase}/crm/v4/objects/emails/${emailId}/associations/contacts/${contactId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${hubspotToken}`
            },
            body: JSON.stringify([{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 198 // Email to Contact
            }])
        });
    } catch (error) {
        console.error('Warning: Failed to associate email with contact:', error.message);
    }

    // Step 3: Associate email with deal using v4 API
    try {
        await fetch(`${apiBase}/crm/v4/objects/emails/${emailId}/associations/deals/${dealId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${hubspotToken}`
            },
            body: JSON.stringify([{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 210 // Email to Deal
            }])
        });
    } catch (error) {
        console.error('Warning: Failed to associate email with deal:', error.message);
    }

    return {
        success: true,
        emailId,
        subject,
        contactId,
        dealId
    };
}

// ============================================
// CONTENT GUARDRAILS
// ============================================

/**
 * Validate email content against professionalism policies
 * Returns { valid: true } or { valid: false, violations: [...] }
 */
function validateEmailContent(body, subject) {
    const violations = [];

    // Policy 1: Minimum content length
    if (body && body.length < 50) {
        violations.push({
            policy: 'MIN_LENGTH',
            message: 'Email body is too short (minimum 50 characters)',
            suggestion: 'Provide more substantive content in the email body'
        });
    }

    // Policy 2: Maximum content length
    if (body && body.length > 5000) {
        violations.push({
            policy: 'MAX_LENGTH',
            message: 'Email body exceeds maximum length (5000 characters)',
            suggestion: 'Shorten the email body or split into multiple emails'
        });
    }

    // Policy 3: Subject required
    if (!subject || subject.trim().length === 0) {
        violations.push({
            policy: 'SUBJECT_REQUIRED',
            message: 'Email subject line is empty',
            suggestion: 'Provide a clear, descriptive subject line'
        });
    }

    // Policy 4: Profanity/unprofessional language check
    const unprofessionalPatterns = [
        { pattern: /\b(damn|crap|hell)\b/i, message: 'Contains mildly unprofessional language' },
        { pattern: /\b(stupid|idiot|dumb)\b/i, message: 'Contains potentially offensive language' },
        { pattern: /!!+/g, message: 'Contains excessive exclamation marks' },
        { pattern: /\?\?+/g, message: 'Contains excessive question marks' },
        { pattern: /[A-Z]{10,}/g, message: 'Contains excessive capitalization (shouting)' }
    ];

    for (const { pattern, message } of unprofessionalPatterns) {
        if (pattern.test(body) || pattern.test(subject || '')) {
            violations.push({
                policy: 'PROFESSIONALISM',
                message,
                suggestion: 'Revise the content to maintain a professional tone'
            });
        }
    }

    // Policy 5: Check for placeholder text
    const placeholderPatterns = [
        /\[INSERT .+?\]/i,
        /\{.+?\}/,
        /TODO:/i,
        /FIXME:/i,
        /XXX/
    ];

    for (const pattern of placeholderPatterns) {
        if (pattern.test(body) || pattern.test(subject || '')) {
            violations.push({
                policy: 'PLACEHOLDER_TEXT',
                message: 'Contains placeholder text that should be replaced',
                suggestion: 'Replace all placeholder text with actual content'
            });
            break; // Only report once
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

/**
 * Output structured JSON response (always to stdout for LLM parsing)
 */
function outputResponse(response) {
    console.log(JSON.stringify(response, null, 2));
    process.exit(response.success ? 0 : 1);
}

// CLI execution - use more robust path comparison
const scriptPath = fileURLToPath(import.meta.url);
const calledPath = process.argv[1] ? resolve(process.argv[1]) : null;
const isCLI = calledPath && (scriptPath === calledPath || scriptPath.includes('email.js'));

if (isCLI && process.argv.length > 2) {
    // Parse command line arguments
    // Supports both --arg=value and --arg value formats
    // Also supports JSON input via --json='{"subject":"...", "body":"..."}'
    const args = process.argv.slice(2);

    function getArg(name) {
        // First try --name=value format
        const eqArg = args.find(a => a.startsWith(`--${name}=`));
        if (eqArg) {
            return eqArg.split('=').slice(1).join('=');
        }

        // Then try --name value format
        const idx = args.findIndex(a => a === `--${name}`);
        if (idx !== -1 && idx + 1 < args.length) {
            return args[idx + 1];
        }

        return null;
    }

    // Check for JSON input first
    const jsonFile = getArg('json-file');
    const jsonInput = getArg('json');
    let subject, body;

    let payload = null;
    if (jsonFile) {
        try {
            payload = JSON.parse(readFileSync(jsonFile, 'utf-8'));
        } catch (e) {
            outputResponse({
                success: false,
                action: 'PARSE_ERROR',
                reason: `Failed to parse JSON file: ${e.message}`,
                suggestion: 'Ensure the --json-file points to valid JSON'
            });
        }
    } else if (jsonInput) {
        try {
            payload = JSON.parse(jsonInput);
        } catch (e) {
            outputResponse({
                success: false,
                action: 'PARSE_ERROR',
                reason: `Failed to parse JSON input: ${e.message}`,
                suggestion: 'Ensure the --json argument contains valid JSON'
            });
        }
    } else if (!process.stdin.isTTY) {
        try {
            const stdinData = readFileSync(0, 'utf-8').trim();
            if (stdinData) {
                payload = JSON.parse(stdinData);
            }
        } catch (e) {
            outputResponse({
                success: false,
                action: 'PARSE_ERROR',
                reason: `Failed to parse JSON from stdin: ${e.message}`,
                suggestion: 'Ensure stdin contains valid JSON'
            });
        }
    }

    if (payload) {
        subject = payload.subject;
        body = payload.body;
    } else {
        subject = getArg('subject');
        body = getArg('body');
    }

    const contactId = getArg('contactId') || getArg('contact') || process.env.TASK_CONTACT_ID;
    const dealId = getArg('dealId') || getArg('deal') || process.env.TASK_DEAL_ID;

    // Validate required fields
    const missingFields = [];
    if (!subject) missingFields.push('subject');
    if (!body) missingFields.push('body');
    if (!contactId) missingFields.push('contactId');
    if (!dealId) missingFields.push('dealId');

    if (missingFields.length > 0) {
        outputResponse({
            success: false,
            action: 'VALIDATION_FAILED',
            reason: `Missing required fields: ${missingFields.join(', ')}`,
            missingFields,
            providedFields: {
                subject: subject ? subject.substring(0, 50) : null,
                body: body ? `${body.substring(0, 50)}...` : null,
                contactId,
                dealId
            },
            suggestion: missingFields.includes('subject') || missingFields.includes('body')
                ? `Add missing parameters: ${missingFields.filter(f => f === 'subject' || f === 'body').map(f => `--${f}="value"`).join(' ')}`
                : 'Ensure TASK_CONTACT_ID and TASK_DEAL_ID environment variables are set'
        });
    } else {
        // Content guardrails check
        const contentValidation = validateEmailContent(body, subject);
        if (!contentValidation.valid) {
            outputResponse({
                success: false,
                action: 'CONTENT_POLICY_VIOLATED',
                reason: 'Email content failed professionalism checks',
                violations: contentValidation.violations,
                suggestion: contentValidation.violations.map(v => v.suggestion).join('; ')
            });
        } else {
            // All validations passed, log the email
            logEmail({ contactId, dealId, subject, body })
                .then(result => {
                    outputResponse({
                        success: true,
                        action: 'EMAIL_LOGGED',
                        emailId: result.emailId,
                        subject: result.subject,
                        contactId: result.contactId,
                        dealId: result.dealId
                    });
                })
                .catch(error => {
                    outputResponse({
                        success: false,
                        action: 'API_ERROR',
                        reason: error.message,
                        suggestion: 'Check HubSpot API credentials and network connectivity'
                    });
                });
        }
    }
}
