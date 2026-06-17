/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const SDK_RUNTIME_HEADER_FILES = [
  'packages/windie-sdk-js/src/transport/AgentSession.ts',
  'packages/windie-sdk-js/src/transport/ManagedAgentSession.ts',
  'packages/windie-sdk-js/src/runtime/Agent.ts',
  'packages/windie-sdk-js/src/runtime/AgentChatSession.ts',
  'packages/windie-sdk-js/src/runtime/AgentClient.ts',
];

describe('sdk runtime header boundary', () => {
  test('generic SDK runtime modules do not describe themselves with product-specific header copy', async () => {
    const sources = await Promise.all(
      SDK_RUNTIME_HEADER_FILES.map(async (relativePath) => fs.readFile(
        path.resolve(__dirname, '..', '..', relativePath),
        'utf8',
      )),
    );
    const combined = sources.join('\n');

    const productName = ['win', 'die'].join('');
    const productHeaderPattern = new RegExp(
      ['Provides the ', productName, ' .* module for the TypeScript SDK runtime'].join(''),
      'i',
    );
    const productClientHeader = `Implements the ${productName} client integration for the TypeScript SDK runtime`;

    expect(combined).not.toMatch(productHeaderPattern);
    expect(combined).not.toContain(productClientHeader);
  });
});
