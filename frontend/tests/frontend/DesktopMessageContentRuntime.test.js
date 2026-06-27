/**
 * Covers desktop message content runtime behavior in the frontend test suite.
 */

import {
  DesktopMessageContentRuntime,
} from '../../src/renderer/app/runtime/desktopMessageContentRuntime';

describe('desktopMessageContentRuntime', () => {
  const {
    isAssistantResponseMessageContentPresentation,
    isErrorMessageContentPresentation,
    isMarkdownMessageContentPresentation,
    isToolActionsSummaryMessageContentPresentation,
    isToolCallMessageContentPresentation,
    isToolExplanationMessageContentPresentation,
    isToolOutputMessageContentPresentation,
    isUserAttachmentMessageContentPresentation,
    resolveMessageContentPresentation,
  } = DesktopMessageContentRuntime;

  test('classifies special message rows by canonical render kind', () => {
    expect(resolveMessageContentPresentation({ type: 'error' }).renderKind)
      .toBe('error');
    expect(resolveMessageContentPresentation({ type: 'tool-output' }).renderKind)
      .toBe('tool-output');
    expect(resolveMessageContentPresentation({ type: 'tool-call' }).renderKind)
      .toBe('tool-call');
    expect(resolveMessageContentPresentation({ type: 'tool-explanation' }).renderKind)
      .toBe('tool-explanation');
    expect(resolveMessageContentPresentation({ type: 'search-source' }).renderKind)
      .toBe('tool-explanation');
    expect(resolveMessageContentPresentation({ type: 'tool-actions-summary' }).renderKind)
      .toBe('tool-actions-summary');
  });

  test('exposes semantic predicates for render kinds', () => {
    expect(isErrorMessageContentPresentation({ renderKind: 'error' })).toBe(true);
    expect(isToolOutputMessageContentPresentation({ renderKind: 'tool-output' })).toBe(true);
    expect(isToolCallMessageContentPresentation({ renderKind: 'tool-call' })).toBe(true);
    expect(isToolExplanationMessageContentPresentation({ renderKind: 'tool-explanation' })).toBe(true);
    expect(isToolActionsSummaryMessageContentPresentation({ renderKind: 'tool-actions-summary' })).toBe(true);
    expect(isUserAttachmentMessageContentPresentation({ renderKind: 'user-with-attachments' })).toBe(true);
    expect(isAssistantResponseMessageContentPresentation({ renderKind: 'assistant-response' })).toBe(true);
    expect(isMarkdownMessageContentPresentation({ renderKind: 'markdown' })).toBe(true);
    expect(isMarkdownMessageContentPresentation({ renderKind: 'error' })).toBe(false);
  });

  test('classifies user display attachment rows through the SDK attachment contract', () => {
    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'show this',
      attachments: [{
        id: 'attachment-1',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
        screenshotRef: 'artifact-1',
      }],
    }).renderKind).toBe('user-with-attachments');

    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      text: 'tool screenshot',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe('assistant-response');

    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'legacy user screenshot',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe('markdown');
  });

  test('classifies assistant llm text rows and exposes visible text state', () => {
    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      type: 'llm-text',
      text: 'Answer',
    })).toEqual({
      renderKind: 'assistant-response',
      hasVisibleAssistantText: true,
    });

    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      text: '   ',
      thinkingText: 'Reasoning',
    })).toEqual({
      renderKind: 'assistant-response',
      hasVisibleAssistantText: false,
    });
  });

  test('uses markdown as the generic fallback kind', () => {
    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'plain text',
    }).renderKind).toBe('markdown');

    expect(resolveMessageContentPresentation(null).renderKind)
      .toBe('markdown');
  });
});
