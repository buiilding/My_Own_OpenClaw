/**
 * Covers desktop transcript session runtime client behavior in the frontend test suite.
 */

import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { desktopTranscriptSessionRuntime } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntime';

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntime', () => ({
  desktopTranscriptSessionRuntime: {
    applyTranscriptSessionUpdate: jest.fn(),
    getActiveConversationRef: jest.fn(),
    getTranscriptSessionInfo: jest.fn(),
  },
}));

const mockApplyTranscriptSessionUpdate = desktopTranscriptSessionRuntime.applyTranscriptSessionUpdate as jest.Mock;

describe('DesktopTranscriptSessionRuntimeClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('bindTranscriptUser updates only the transcript user through the session runtime', () => {
    expect(DesktopTranscriptSessionRuntimeClient.bindTranscriptUser(' user-bound ')).toBe(true);

    expect(mockApplyTranscriptSessionUpdate).toHaveBeenCalledWith(undefined, 'user-bound', {
      syncToMainProcess: true,
    });
  });

  test('bindTranscriptUser ignores invalid user ids', () => {
    expect(DesktopTranscriptSessionRuntimeClient.bindTranscriptUser('   ')).toBe(false);

    expect(mockApplyTranscriptSessionUpdate).not.toHaveBeenCalled();
  });
});
