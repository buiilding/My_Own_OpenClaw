/**
 * Covers SDK tool detail projection sanitization.
 */

import {
  DesktopSdkToolDetailProjection,
} from '../../src/renderer/app/runtime/desktopSdkToolDetailProjection';

const {
  sanitizeSdkToolDetailRecord,
} = DesktopSdkToolDetailProjection;

describe('DesktopSdkToolDetailProjection', () => {
  test('keeps display-only tool detail fields and removes owned channels', () => {
    expect(sanitizeSdkToolDetailRecord({
      displaySource: 'sdk-entry-details',
      requestId: 'req-1',
      attachments: [{ id: 'attachment-1' }],
      modelFacingToolCall: { name: 'read_file' },
      modelId: 'detail-model',
      modelProvider: 'detail-provider',
      payload: { hidden: true },
      raw: { output: 'raw output' },
      screenshot: { artifactId: 'shot' },
      screenshotRef: 'artifact-shot',
      screenshotUrl: '/api/artifacts/artifact-shot',
      screenshot_ref: 'artifact-shot',
      screenshot_refs: ['artifact-shot'],
      screenshot_url: '/api/artifacts/artifact-shot',
      screenshotRefs: ['artifact-shot'],
      structuredPayload: { output: 'legacy output' },
    })).toEqual({
      displaySource: 'sdk-entry-details',
      requestId: 'req-1',
    });
  });

  test('returns null for malformed records or records with only owned channels', () => {
    expect(sanitizeSdkToolDetailRecord(null)).toBeNull();
    expect(sanitizeSdkToolDetailRecord([{ displaySource: 'array' }])).toBeNull();
    expect(sanitizeSdkToolDetailRecord({
      attachments: [{ id: 'attachment-1' }],
      screenshotRef: 'artifact-shot',
    })).toBeNull();
  });
});
