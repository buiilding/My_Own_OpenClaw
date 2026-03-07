import { buildToolOutputMessage } from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamToolMessages';

describe('chatStreamToolMessages', () => {
  test('preserves inline screenshot for backend tool-output events when no screenshot_ref exists', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('tool-output-inline');

    const message = buildToolOutputMessage(
      {
        id: 'event-1',
        type: 'tool-output',
        payload: {
          tool_name: 'mouse_control',
          success: true,
          output: 'clicked',
          screenshot: 'inline-shot',
        },
        turn_ref: 'turn-1',
      } as any,
      'clicked',
      { modelId: 'model-1', modelProvider: 'provider-1' },
      'inline-shot',
      null,
      null,
    );

    expect(message).toEqual(expect.objectContaining({
      id: 'tool-output-inline',
      type: 'tool-output',
      screenshot: 'inline-shot',
      screenshotRef: null,
      screenshotUrl: null,
    }));

    uuidSpy.mockRestore();
  });
});
