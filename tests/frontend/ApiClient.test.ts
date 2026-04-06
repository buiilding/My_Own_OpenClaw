import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { IpcBridge, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { getMemoryRetrievalInjectionEnabled } from '../../frontend/src/renderer/utils/memoryRetrievalPreference';

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => {
  const actual = jest.requireActual('../../frontend/src/renderer/infrastructure/ipc/bridge');
  return {
    ...actual,
    IpcBridge: {
      ...actual.IpcBridge,
      send: jest.fn(),
    },
  };
});

jest.mock('../../frontend/src/renderer/utils/memoryRetrievalPreference', () => ({
  getMemoryRetrievalInjectionEnabled: jest.fn(),
}));

describe('ApiClient.sendQuery', () => {
  const mockSend = IpcBridge.send as jest.MockedFunction<typeof IpcBridge.send>;
  const mockGetMemoryRetrievalInjectionEnabled = (
    getMemoryRetrievalInjectionEnabled as jest.MockedFunction<typeof getMemoryRetrievalInjectionEnabled>
  );

  beforeEach(() => {
    mockSend.mockReset();
    mockGetMemoryRetrievalInjectionEnabled.mockReset();
    mockGetMemoryRetrievalInjectionEnabled.mockReturnValue(true);
  });

  test('normalizes screenshot refs and urls before sending query payload', async () => {
    mockGetMemoryRetrievalInjectionEnabled.mockReturnValue(false);

    await ApiClient.sendQuery(
      'hello',
      'conv-1',
      ' artifact-main ',
      ' https://cdn.example/shot.png ',
      [' artifact-1 ', '   ', '', 'artifact-2'],
      null,
      null,
      null,
      null,
      ' /workspace/WindieOS ',
    );

    const [channel, message] = mockSend.mock.calls[0];
    expect(channel).toBe(SEND_CHANNELS.TO_BACKEND);
    expect(message).toMatchObject({
      type: 'query',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
        screenshot_ref: 'artifact-main',
        screenshot_url: 'https://cdn.example/shot.png',
        screenshot_refs: ['artifact-1', 'artifact-2'],
        workspace_path: '/workspace/WindieOS',
        memory_retrieval_enabled: false,
      },
    });
  });

  test('drops whitespace-only screenshot refs and urls from query payload', async () => {
    await ApiClient.sendQuery(
      'hello-2',
      'conv-2',
      '   ',
      '   ',
      ['   ', ''],
    );

    const [channel, message] = mockSend.mock.calls[0];
    expect(channel).toBe(SEND_CHANNELS.TO_BACKEND);
    expect(message).toMatchObject({
      type: 'query',
      payload: {
        text: 'hello-2',
        conversation_ref: 'conv-2',
        screenshot_ref: null,
        screenshot_url: null,
        screenshot_refs: null,
        workspace_path: null,
        memory_retrieval_enabled: true,
      },
    });
  });

  test('includes inline screenshot payload when provided', async () => {
    const inlineScreenshot = 'A'.repeat(256);

    await ApiClient.sendQuery(
      'hello-inline',
      'conv-inline',
      null,
      null,
      null,
      null,
      null,
      null,
      inlineScreenshot,
    );

    const [channel, message] = mockSend.mock.calls[0];
    expect(channel).toBe(SEND_CHANNELS.TO_BACKEND);
    expect(message).toMatchObject({
      type: 'query',
      payload: {
        text: 'hello-inline',
        conversation_ref: 'conv-inline',
        screenshot_ref: null,
        screenshot: inlineScreenshot,
        workspace_path: null,
      },
    });
  });
});
