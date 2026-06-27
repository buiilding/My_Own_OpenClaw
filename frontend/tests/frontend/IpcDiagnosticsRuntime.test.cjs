/** @jest-environment node */

const {
  handleRendererLog,
} = require('../../src/main/ipc/ipc_diagnostics_runtime.cjs');

describe('ipc_diagnostics_runtime', () => {
  test('ignores malformed renderer log payloads', () => {
    const log = jest.fn();

    expect(handleRendererLog(null, { log })).toBe(false);
    expect(handleRendererLog([], { log })).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('routes renderer interaction logs through the interaction label with production redaction', () => {
    const log = jest.fn();
    const writeRendererLogLine = jest.fn();
    const appendRendererInteractionDiagnostic = jest.fn();

    expect(handleRendererLog({
      source: 'renderer-interaction',
      entry: { event: 'send', messageText: 'secret user text', messageTextLength: 16 },
    }, { log, appendRendererInteractionDiagnostic, writeRendererLogLine })).toBe(true);

    expect(log).not.toHaveBeenCalled();
    expect(writeRendererLogLine).toHaveBeenCalledWith(
      'renderer',
      expect.stringContaining('[Renderer][interaction]'),
    );
    expect(appendRendererInteractionDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1,
      source: 'renderer-interaction',
      action: 'unknown',
      event: 'send',
      messageText: '[redacted]',
      messageTextRedacted: true,
      messageTextLength: 16,
    }));
    expect(JSON.stringify(appendRendererInteractionDiagnostic.mock.calls[0])).not.toContain('secret user text');
  });

  test('formats renderer interaction entries as compact terminal summaries', () => {
    const writeRendererLogLine = jest.fn();

    expect(handleRendererLog({
      source: 'renderer-interaction',
      entry: {
        action: 'button_clicked',
        event: 'click',
        view: 'minimal-chat-pill',
        target: {
          label: 'Open config',
          tagName: 'button',
        },
      },
    }, { writeRendererLogLine, appendRendererInteractionDiagnostic: jest.fn() })).toBe(true);

    expect(writeRendererLogLine).toHaveBeenCalledWith(
      'renderer',
      '[Renderer][interaction] action=button_clicked event=click view=minimal-chat-pill label="Open config" target=button',
    );
  });

  test('routes generic renderer logs through the renderer layer sink', () => {
    const log = jest.fn();
    const writeRendererLogLine = jest.fn();
    const payload = { source: 'chat', message: 'mounted' };

    expect(handleRendererLog(payload, { log, writeRendererLogLine })).toBe(true);

    expect(log).not.toHaveBeenCalled();
    expect(writeRendererLogLine).toHaveBeenCalledWith(
      'renderer',
      expect.stringContaining("[Renderer][ipc] { source: 'chat', message: 'mounted' }"),
    );
  });

  test('allows message text only when diagnostics opt in and build is non-production', () => {
    const appendRendererInteractionDiagnostic = jest.fn();

    expect(handleRendererLog({
      source: 'renderer-interaction',
      entry: {
        action: 'message_sent',
        event: 'send-message',
        messageText: 'diagnostic text',
      },
    }, {
      appendRendererInteractionDiagnostic,
      diagnosticsOptions: {
        allowMessageText: true,
        isDev: true,
      },
      writeRendererLogLine: jest.fn(),
    })).toBe(true);

    expect(appendRendererInteractionDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      messageText: 'diagnostic text',
      messageTextRedacted: false,
    }));
  });
});
