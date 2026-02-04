/* eslint-env jest */
require('@testing-library/jest-dom');

const suppressedPrefixes = [
  '[ConfigStorage]',
  '[ToolExecutionService]',
  '[Timing]',
];

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

const shouldSuppress = (args) =>
  typeof args[0] === 'string' && suppressedPrefixes.some((prefix) => args[0].startsWith(prefix));

['log', 'warn', 'error'].forEach((method) => {
  jest.spyOn(console, method).mockImplementation((...args) => {
    if (shouldSuppress(args)) {
      return;
    }
    originalConsole[method](...args);
  });
});
