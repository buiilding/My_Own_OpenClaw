/**
 * Covers desktop transcript session runtime client behavior in the frontend test suite.
 */

import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopTranscriptSessionRuntime } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntime';

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntime', () => ({
  DesktopTranscriptSessionRuntime: {
    applyTranscriptSessionUpdate: jest.fn(),
    getActiveConversationRef: jest.fn(),
    getTranscriptSessionInfo: jest.fn(),
  },
}));

const mockApplyTranscriptSessionUpdate = DesktopTranscriptSessionRuntime.applyTranscriptSessionUpdate as jest.Mock;

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
