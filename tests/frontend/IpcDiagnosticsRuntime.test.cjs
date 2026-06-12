/** @jest-environment node */

const {
  formatFrontendInteractionSummary,
  handleRendererLog,
  normalizeFrontendInteractionEntry,
  shouldIncludeMessageText,
} = require('../../frontend/src/main/ipc/ipc_diagnostics_runtime.cjs');

describe('ipc_diagnostics_runtime', () => {
  test('ignores malformed renderer log payloads', () => {
    const log = jest.fn();

    expect(handleRendererLog(null, { log })).toBe(false);
    expect(handleRendererLog([], { log })).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('routes frontend interaction logs through the interaction label with production redaction', () => {
    const log = jest.fn();
    const appendFrontendInteractionDiagnostic = jest.fn();

    expect(handleRendererLog({
      source: 'frontend-interaction',
      entry: { event: 'send', messageText: 'secret user text', messageTextLength: 16 },
    }, { log, appendFrontendInteractionDiagnostic })).toBe(true);

    expect(log).not.toHaveBeenCalled();
    expect(appendFrontendInteractionDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1,
      source: 'frontend-interaction',
      action: 'unknown',
      event: 'send',
      messageText: '[redacted]',
      messageTextRedacted: true,
      messageTextLength: 16,
    }));
    expect(JSON.stringify(appendFrontendInteractionDiagnostic.mock.calls[0])).not.toContain('secret user text');
  });

  test('formats frontend interaction entries as compact terminal summaries', () => {
    expect(formatFrontendInteractionSummary({
      action: 'button_clicked',
      event: 'click',
      view: 'minimal-chat-pill',
      target: {
        label: 'Open config',
        tagName: 'button',
      },
    })).toBe('action=button_clicked event=click view=minimal-chat-pill label="Open config" target=button');
  });

  test('routes generic renderer logs through the renderer label', () => {
    const log = jest.fn();
    const payload = { source: 'chat', message: 'mounted' };

    expect(handleRendererLog(payload, { log })).toBe(true);

    expect(log).toHaveBeenCalledWith('[RendererLog]', payload);
  });

  test('allows message text only when diagnostics opt in and build is non-production', () => {
    expect(shouldIncludeMessageText({ allowMessageText: true, isDev: true })).toBe(true);
    expect(shouldIncludeMessageText({ allowMessageText: true, isDev: false })).toBe(false);
    expect(shouldIncludeMessageText({ allowMessageText: false, isDev: true })).toBe(false);

    expect(normalizeFrontendInteractionEntry({
      action: 'message_sent',
      event: 'send-message',
      messageText: 'diagnostic text',
    }, {
      allowMessageText: true,
      isDev: true,
    })).toEqual(expect.objectContaining({
      messageText: 'diagnostic text',
      messageTextRedacted: false,
    }));
  });
});
