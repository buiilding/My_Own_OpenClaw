#!/usr/bin/env node

const fs = require('fs');

const REQUIRED_TOKENS = [
  'inv-read-doc',
  'inv-chat-loop-flow',
  'inv-loop-interactivity',
  'inv-linux-capture-hide',
  'inv-win-mac-content-protection',
  'inv-no-focus-restore',
  'inv-tests-updated',
];

const NA_TOKEN = 'inv-na-no-frontend-runtime-change';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isChecked(body, token) {
  const escapedToken = escapeRegExp(token);
  const pattern = new RegExp(`-\\s*\\[[xX]\\]\\s*\`?${escapedToken}\`?\\b`);
  return pattern.test(body);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    fail('GITHUB_EVENT_PATH is required.');
  }

  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const pullRequest = payload?.pull_request;
  if (!pullRequest) {
    console.log('No pull_request payload detected. Skipping runtime invariant checklist gate.');
    return;
  }

  const body = typeof pullRequest.body === 'string' ? pullRequest.body : '';
  const naChecked = isChecked(body, NA_TOKEN);
  const missingRequired = REQUIRED_TOKENS.filter((token) => !isChecked(body, token));

  if (naChecked) {
    console.log(`Runtime invariant checklist gate passed with N/A override token: ${NA_TOKEN}`);
    return;
  }

  if (missingRequired.length === 0) {
    console.log('Runtime invariant checklist gate passed with all required tokens checked.');
    return;
  }

  fail([
    'Missing required frontend runtime invariant checklist tokens in PR body:',
    ...missingRequired.map((token) => `- ${token}`),
    '',
    `Either check all required tokens or check N/A token: ${NA_TOKEN}`,
    'See: docs/frontend/runtime/frontend_runtime_invariants_checklist.md',
  ].join('\n'));
}

main();
