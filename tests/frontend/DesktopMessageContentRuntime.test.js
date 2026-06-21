/**
 * Covers desktop message content runtime behavior in the frontend test suite.
 */

import {
  isAssistantResponseMessageContentPresentation,
  isErrorMessageContentPresentation,
  isMarkdownMessageContentPresentation,
  isToolActionsSummaryMessageContentPresentation,
  isToolCallMessageContentPresentation,
  isToolExplanationMessageContentPresentation,
  isToolOutputMessageContentPresentation,
  isUserScreenshotMessageContentPresentation,
  resolveMessageContentPresentation,
} from '../../frontend/src/renderer/app/runtime/desktopMessageContentRuntime';

describe('desktopMessageContentRuntime', () => {
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
    expect(isUserScreenshotMessageContentPresentation({ renderKind: 'user-with-screenshot' })).toBe(true);
    expect(isAssistantResponseMessageContentPresentation({ renderKind: 'assistant-response' })).toBe(true);
    expect(isMarkdownMessageContentPresentation({ renderKind: 'markdown' })).toBe(true);
    expect(isMarkdownMessageContentPresentation({ renderKind: 'error' })).toBe(false);
  });

  test('classifies user screenshot rows through the screenshot runtime contract', () => {
    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'show this',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe('user-with-screenshot');

    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      text: 'tool screenshot',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe('assistant-response');
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
