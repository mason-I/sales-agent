#!/usr/bin/env node

import Parallel from 'parallel-web';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '../../../../');
const envPath = resolve(projectRoot, '.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const DEFAULT_INCLUDE_DOMAINS = [
  'support.zendesk.com',
  'zendesk.com',
  'www.zendesk.com'
];

function normalizeDomain(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      return url.hostname;
    }
  } catch {
    // fall through to best-effort cleanup
  }
  return trimmed.replace(/^https?:\/\//, '').split('/')[0];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (const arg of args) {
    if (arg.startsWith('--json=')) {
      const raw = arg.slice('--json='.length);
      parsed.json = raw;
    } else if (arg.startsWith('--json-file=')) {
      parsed.jsonFile = arg.slice('--json-file='.length);
    } else if (arg.startsWith('--objective=')) {
      parsed.objective = arg.slice('--objective='.length);
    } else if (arg.startsWith('--max_results=')) {
      parsed.max_results = Number(arg.slice('--max_results='.length));
    }
  }

  if (parsed.jsonFile) {
    try {
      const payload = JSON.parse(readFileSync(parsed.jsonFile, 'utf-8'));
      return payload;
    } catch (error) {
      return { error: `Invalid JSON file: ${error.message}` };
    }
  }

  if (parsed.json) {
    try {
      const payload = JSON.parse(parsed.json);
      return payload;
    } catch (error) {
      return { error: `Invalid JSON: ${error.message}` };
    }
  }

  if (!process.stdin.isTTY) {
    try {
      const stdinData = readFileSync(0, 'utf-8').trim();
      if (stdinData) {
        return JSON.parse(stdinData);
      }
    } catch (error) {
      return { error: `Invalid JSON from stdin: ${error.message}` };
    }
  }

  return parsed;
}

function outputResponse(response) {
  console.log(JSON.stringify(response, null, 2));
  process.exit(response.success ? 0 : 1);
}

function buildNotFound(reason, links = []) {
  return {
    success: true,
    action: 'ZENDESK_KB_SEARCH',
    output: {
      status: 'NOT_FOUND',
      answer: null,
      steps: [],
      plan_dependencies: [],
      links,
      confidence: 'low',
      reason
    }
  };
}

async function main() {
  const input = parseArgs();

  if (input.error) {
    outputResponse({
      success: false,
      action: 'INVALID_INPUT',
      reason: input.error,
      suggestion: 'Pass a valid JSON payload to --json'
    });
    return;
  }

  const objective = input.objective;
  const maxResults = Number.isFinite(input.max_results) ? input.max_results : 10;

  if (!objective || objective.trim() === '') {
    outputResponse({
      success: false,
      action: 'VALIDATION_FAILED',
      reason: 'objective is required',
      suggestion: 'Provide --json with an objective string'
    });
    return;
  }

  const client = new Parallel({
    apiKey: process.env.PARALLEL_API_KEY,
    fetch: (url, options = {}) => {
      const headers = new fetch.Headers(options.headers || {});
      headers.set('parallel-beta', 'search-extract-2025-10-10');
      return fetch(url, { ...options, headers });
    }
  });

  const includeDomains = DEFAULT_INCLUDE_DOMAINS
    .map(normalizeDomain)
    .filter(Boolean);

  const params = {
    mode: 'one-shot',
    max_results: maxResults,
    objective,
    search_queries: null,
    source_policy: {
      include_domains: includeDomains
    },
    betas: ['search-extract-2025-10-10']
  };

  let result;
  try {
    result = await client.beta.search(params);
  } catch (error) {
    // Fallback to direct HTTP if SDK fails (network/transport issues)
    try {
      const response = await fetch('https://api.parallel.ai/v1beta/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PARALLEL_API_KEY,
          'parallel-beta': 'search-extract-2025-10-10'
        },
        body: JSON.stringify({
          mode: params.mode,
          max_results: params.max_results,
          objective: params.objective,
          search_queries: params.search_queries,
          source_policy: params.source_policy
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      result = await response.json();
    } catch (fallbackError) {
      throw new Error(fallbackError.message || error.message);
    }
  }

  const results = result?.results || [];

  if (results.length === 0) {
    outputResponse(buildNotFound('No results returned for the objective.'));
    return;
  }

  const links = results.map(r => r.url).filter(Boolean).slice(0, 3);
  const excerpts = results
    .flatMap(r => (r.excerpts || []))
    .map(text => (text || '').trim())
    .filter(Boolean);

  if (excerpts.length === 0) {
    outputResponse(buildNotFound('Results contained no excerpts.', links));
    return;
  }

  const answer = excerpts.slice(0, 2).join('\n\n');

  outputResponse({
    success: true,
    action: 'ZENDESK_KB_SEARCH',
    output: {
      status: 'FOUND',
      answer,
      steps: [],
      plan_dependencies: [],
      links,
      confidence: 'medium'
    }
  });
}

main().catch((error) => {
  outputResponse({
    success: false,
    action: 'API_ERROR',
    reason: error.message,
    suggestion: 'Check PARALLEL_API_KEY and network connectivity.'
  });
});
