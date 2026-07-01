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
  test('keeps only exact SDK display detail fields', () => {
    expect(sanitizeSdkToolDetailRecord({
      displaySource: 'sdk-entry-details',
      requestId: 'req-1',
      request_id: 'req-snake',
      toolName: 'read_file',
      toolCallId: 'call-1',
      bundleId: 'bundle-1',
      displayCorrelationId: 'corr-1',
      sourceEventType: 'tool_output',
      success: true,
      extraDisplayData: 'renderer must not inherit new fields',
      paddedDisplaySource: ' sdk-entry-details ',
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
      toolName: 'read_file',
      toolCallId: 'call-1',
      bundleId: 'bundle-1',
      displayCorrelationId: 'corr-1',
      sourceEventType: 'tool_output',
      success: true,
    });
  });

  test('returns null for malformed records or records without exact display fields', () => {
    expect(sanitizeSdkToolDetailRecord(null)).toBeNull();
    expect(sanitizeSdkToolDetailRecord([{ displaySource: 'array' }])).toBeNull();
    expect(sanitizeSdkToolDetailRecord({
      attachments: [{ id: 'attachment-1' }],
      screenshotRef: 'artifact-shot',
    })).toBeNull();
    expect(sanitizeSdkToolDetailRecord({
      requestId: ' req-1 ',
      success: 'true',
    })).toBeNull();
  });
});
