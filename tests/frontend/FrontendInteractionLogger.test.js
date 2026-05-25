jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
  },
  SEND_CHANNELS: {
    RENDERER_LOG: 'renderer-log',
  },
}));

import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
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

  test('logs message sends without message text', () => {
    logUserSentMessage({
      conversationRef: 'conv-1',
      senderSurface: 'main-window',
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
      textLength: 27,
      attachmentCount: 2,
      imageCount: 1,
      readableFileCount: 1,
    }));
    expect(consoleSpy.mock.calls[0][1]).not.toHaveProperty('text');
    expect(IpcBridge.send).toHaveBeenCalledWith('renderer-log', expect.objectContaining({
      source: 'frontend-interaction',
      entry: expect.objectContaining({
        action: 'message_sent',
        event: 'send-message',
        conversationRef: 'conv-1',
      }),
    }));
  });
});
