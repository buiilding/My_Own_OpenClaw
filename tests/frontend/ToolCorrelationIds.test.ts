import {
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../../frontend/src/renderer/features/chat/utils/toolCorrelationIds';

describe('toolCorrelationIds', () => {
  test('resolves tool-call ids with correlation_id/request_id/event id precedence', () => {
    expect(resolveToolCallCorrelationId({
      correlation_id: 'corr-1',
      request_id: 'req-1',
    }, 'event-1')).toBe('corr-1');

    expect(resolveToolCallCorrelationId({
      correlation_id: '   ',
      request_id: ' req-2 ',
    }, 'event-2')).toBe('req-2');

    expect(resolveToolCallCorrelationId({
      correlation_id: '   ',
      request_id: '   ',
    }, ' event-3 ')).toBe('event-3');
  });

  test('resolves tool-output ids with request_id/metadata/event id precedence', () => {
    expect(resolveToolOutputCorrelationId({
      request_id: 'req-out-1',
      metadata: { request_id: 'meta-out-1' },
    }, 'event-out-1')).toBe('req-out-1');

    expect(resolveToolOutputCorrelationId({
      request_id: '   ',
      metadata: { request_id: ' meta-out-2 ' },
    }, 'event-out-2')).toBe('meta-out-2');

    expect(resolveToolOutputCorrelationId({
      request_id: '   ',
      metadata: { request_id: '   ' },
    }, ' event-out-3 ')).toBe('event-out-3');
  });

});
