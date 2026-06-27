/**
 * Covers renderer clipboard runtime behavior in the frontend test suite.
 */

import { DesktopClipboardRuntime } from '../../src/renderer/app/runtime/desktopClipboardRuntime';

describe('desktopClipboardRuntime', () => {
  test('writes non-empty text through injected clipboard adapter', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);

    await expect(DesktopClipboardRuntime.writeText('copy me', {
      clipboard: { writeText },
    })).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('copy me');
  });

  test('no-ops empty text without touching clipboard adapter', async () => {
    const writeText = jest.fn();

    await expect(DesktopClipboardRuntime.writeText('', {
      clipboard: { writeText },
    })).resolves.toBe(false);

    expect(writeText).not.toHaveBeenCalled();
  });

  test('reports unavailable clipboard write adapter', async () => {
    await expect(DesktopClipboardRuntime.writeText('copy me', {
      clipboard: {},
    })).rejects.toThrow('Clipboard writeText is unavailable');
  });
});
