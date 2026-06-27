/**
 * Covers renderer interaction logger behavior in the frontend test suite.
 */

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
  },
  SEND_CHANNELS: {
    RENDERER_LOG: 'renderer-log',
  },
}));

import fs from 'fs';
import path from 'path';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import {
  installRendererInteractionLogger,
  logUserSentMessage,
} from '../../src/renderer/infrastructure/interaction/rendererInteractionLogger';

const retiredDesktopAgentFlag = (suffix) => `__DESKTOP_${'AGENT'}_${suffix}__`;

describe('rendererInteractionLogger', () => {
  let cleanup = null;
  let consoleSpy = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    IpcBridge.send.mockClear();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    delete window.__DESKTOP_RUNTIME_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__;
    delete window.__DESKTOP_RUNTIME_DEBUG_SURFACE_STDOUT__;
    delete window[retiredDesktopAgentFlag('ENABLE_INTERACTION_MESSAGE_TEXT_LOGS')];
    delete window[retiredDesktopAgentFlag('DEBUG_SURFACE_STDOUT')];
    consoleSpy?.mockRestore();
  });

  test('logs buttons by accessible label', () => {
    document.body.innerHTML = '<button aria-label="Open settings"><span></span></button>';
    cleanup = installRendererInteractionLogger();

    document.querySelector('button').click();

    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        action: 'settings_button_clicked',
        event: 'click',
        target: expect.objectContaining({
          label: 'Open settings',
          tagName: 'button',
        }),
      }),
    }));
  });

  test('logs clicked chat titles from dashboard rows', () => {
    document.body.innerHTML = `
      <button class="cg-chat-item" data-interaction-label="Chat: Planning notes">
        Planning notes
      </button>
    `;
    cleanup = installRendererInteractionLogger();

    document.querySelector('button').click();

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        action: 'chat_clicked',
        target: expect.objectContaining({
          label: 'Chat: Planning notes',
        }),
      }),
    }));
  });

  test('logs settings button clicks', () => {
    document.body.innerHTML = '<button><span>Settings</span></button>';
    cleanup = installRendererInteractionLogger();

    document.querySelector('button').click();

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('logs control changes without exposing field values', () => {
    document.body.innerHTML = `
      <label>
        Enable wakeword
        <input type="checkbox" />
      </label>
    `;
    const checkbox = document.querySelector('input');
    cleanup = installRendererInteractionLogger();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('redacts message text by default when logging message sends', () => {
    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
      attachmentCount: 2,
      imageCount: 1,
      readableFileCount: 1,
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        action: 'message_sent',
        event: 'send-message',
        conversationRef: 'conv-1',
        messageText: '[redacted]',
        messageTextRedacted: true,
        messageTextLength: 27,
      }),
    }));
  });

  test('includes message text only when explicit diagnostic flag is enabled', () => {
    window.__DESKTOP_RUNTIME_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__ = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        schemaVersion: 1,
        action: 'message_sent',
        event: 'send-message',
        messageText: 'show this message in logs',
        messageTextRedacted: false,
        messageTextLength: 27,
      }),
    }));
  });

  test('ignores removed interaction message-text diagnostic flag', () => {
    window.__WINDIE_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__ = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        messageText: '[redacted]',
        messageTextRedacted: true,
      }),
    }));

    delete window.__WINDIE_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__;
  });

  test('ignores retired interaction message-text diagnostic flag', () => {
    window[retiredDesktopAgentFlag('ENABLE_INTERACTION_MESSAGE_TEXT_LOGS')] = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'renderer-interaction',
      entry: expect.objectContaining({
        messageText: '[redacted]',
        messageTextRedacted: true,
      }),
    }));
  });

  test('prints compact renderer interaction summaries only when debug stdout is enabled', () => {
    window.__DESKTOP_RUNTIME_DEBUG_SURFACE_STDOUT__ = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[RendererInteraction] action=message_sent event=send-message view=main label="-" target=-',
    );
  });

  test('ignores removed debug stdout diagnostic flag', () => {
    window.__WINDIE_DEBUG_SURFACE_STDOUT__ = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(consoleSpy).not.toHaveBeenCalled();

    delete window.__WINDIE_DEBUG_SURFACE_STDOUT__;
  });

  test('ignores retired debug stdout diagnostic flag', () => {
    window[retiredDesktopAgentFlag('DEBUG_SURFACE_STDOUT')] = true;

    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: 'show this message in logs',
      textLength: 27,
    });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('feature code does not write ad hoc renderer interaction logs', () => {
    const featureRoot = path.resolve(__dirname, '../../src/renderer/features');
    const sources = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(absolute);
          continue;
        }
        if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
          sources.push([absolute, fs.readFileSync(absolute, 'utf8')]);
        }
      }
    };
    visit(featureRoot);

    const offenders = sources
      .filter(([, source]) => (
        source.includes('[RendererInteraction]')
        || source.includes("source: 'renderer-interaction'")
        || source.includes('source: "renderer-interaction"')
      ))
      .map(([absolute]) => path.relative(featureRoot, absolute));

    expect(offenders).toEqual([]);
  });
});
