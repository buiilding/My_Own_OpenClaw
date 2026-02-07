/* eslint-env jest */
require('@testing-library/jest-dom');
const { randomUUID } = require('crypto');

if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = randomUUID;
}

const suppressedPrefixes = [
  '[ConfigStorage]',
  '[Config]',
  '[Settings Update]',
  '[ToolExecutionService]',
  '[useChatMessageSender]',
  '[VoiceMode]',
  '[Timing]',
];

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

const shouldSuppress = (args) =>
  args.some(
    (arg) =>
      typeof arg === 'string'
      && suppressedPrefixes.some((prefix) => arg.startsWith(prefix)),
  );

['log', 'warn', 'error'].forEach((method) => {
  jest.spyOn(console, method).mockImplementation((...args) => {
    if (shouldSuppress(args)) {
      return;
    }
    originalConsole[method](...args);
  });
});
