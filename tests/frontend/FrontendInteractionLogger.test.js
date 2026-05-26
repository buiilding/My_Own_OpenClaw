jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
  },
  SEND_CHANNELS: {
    RENDERER_LOG: 'renderer-log',
  },
}));

import fs from 'fs';
import path from 'path';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  createFrontendInteractionEntry,
  describeInteractionTarget,
  installFrontendInteractionLogger,
  logUserSentMessage,
} from '../../frontend/src/renderer/infrastructure/interaction/frontendInteractionLogger';

describe('frontendInteractionLogger', () => {
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
    delete window.__WINDIE_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__;
    consoleSpy?.mockRestore();
  });

  test('describes buttons by accessible label', () => {
    document.body.innerHTML = '<button aria-label="Open settings"><span></span></button>';
    const button = document.querySelector('button');

    expect(describeInteractionTarget(button)).toEqual(expect.objectContaining({
      label: 'Open settings',
      tagName: 'button',
    }));
  });

  test('logs clicked chat titles from dashboard rows', () => {
    document.body.innerHTML = `
      <button class="cg-chat-item" data-interaction-label="Chat: Planning notes">
        Planning notes
      </button>
    `;
    cleanup = installFrontendInteractionLogger();

    document.querySelector('button').click();

    expect(consoleSpy).toHaveBeenCalledWith('[FrontendInteraction]', expect.objectContaining({
      action: 'chat_clicked',
      event: 'click',
      target: expect.objectContaining({
        label: 'Chat: Planning notes',
        className: 'cg-chat-item',
      }),
    }));
    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'frontend-interaction',
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
    cleanup = installFrontendInteractionLogger();

    document.querySelector('button').click();

    expect(consoleSpy).toHaveBeenCalledWith('[FrontendInteraction]', expect.objectContaining({
      action: 'settings_button_clicked',
      event: 'click',
      target: expect.objectContaining({
        label: 'Settings',
      }),
    }));
  });

  test('logs control changes without exposing field values', () => {
    document.body.innerHTML = `
      <label>
        Enable wakeword
        <input type="checkbox" />
      </label>
    `;
    const checkbox = document.querySelector('input');
    cleanup = installFrontendInteractionLogger();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(consoleSpy).toHaveBeenCalledWith('[FrontendInteraction]', expect.objectContaining({
      action: 'control_changed',
      event: 'change',
      checked: true,
      target: expect.objectContaining({
        label: 'Enable wakeword',
        type: 'checkbox',
      }),
    }));
    expect(consoleSpy.mock.calls[0][1]).not.toHaveProperty('value');
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

    expect(consoleSpy).toHaveBeenCalledWith('[FrontendInteraction]', expect.objectContaining({
      action: 'message_sent',
      event: 'send-message',
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
      messageText: '[redacted]',
      messageTextRedacted: true,
      messageTextLength: 27,
      textLength: 27,
      attachmentCount: 2,
      imageCount: 1,
      readableFileCount: 1,
    }));
    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'frontend-interaction',
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
    window.__WINDIE_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__ = true;

    expect(createFrontendInteractionEntry('message_sent', {
      event: 'send-message',
      messageText: 'show this message in logs',
      textLength: 27,
    })).toEqual(expect.objectContaining({
      schemaVersion: 1,
      source: 'frontend-interaction',
      action: 'message_sent',
      event: 'send-message',
      messageText: 'show this message in logs',
      messageTextRedacted: false,
      messageTextLength: 27,
    }));
  });

  test('feature code does not write ad hoc frontend interaction logs', () => {
    const featureRoot = path.resolve(__dirname, '../../frontend/src/renderer/features');
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
        source.includes('[FrontendInteraction]')
        || source.includes("source: 'frontend-interaction'")
        || source.includes('source: "frontend-interaction"')
      ))
      .map(([absolute]) => path.relative(featureRoot, absolute));

    expect(offenders).toEqual([]);
  });
});
