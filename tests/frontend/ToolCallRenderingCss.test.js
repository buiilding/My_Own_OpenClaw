import fs from 'node:fs';
import path from 'node:path';

describe('tool call rendering CSS', () => {
  test('keeps tool-call previews in the transcript flow instead of a nested scroll box', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), '../frontend/src/renderer/styles/ChatInterface.css'),
      'utf8',
    );
    const body = [...css.matchAll(/[^{}]*\.tool-call-content[^{}]*\{(?<body>[^}]+)\}/g)]
      .map((match) => match.groups?.body || '')
      .join('\n');

    expect(body).toEqual(expect.stringContaining('max-height: none;'));
    expect(body).toEqual(expect.stringContaining('overflow-y: visible;'));
    expect(body).toEqual(expect.stringContaining('white-space: pre-wrap;'));
    expect(body).toEqual(expect.stringContaining('overflow-wrap: anywhere;'));
    expect(body).not.toEqual(expect.stringContaining('white-space: pre;'));
  });
});
