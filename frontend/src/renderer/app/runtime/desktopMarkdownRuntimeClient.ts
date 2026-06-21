/**
 * Coordinates markdown, find highlighting, and LLM output normalization for renderer chat clients.
 */

import {
  collectTextMatches,
  extractTextFromHtml,
  highlightPlainTextToHtml,
  highlightSanitizedHtml,
  toSanitizedMarkdownHtml,
} from '../../infrastructure/markdown';
import {
  resolveLlmOutputContract,
} from '../../infrastructure/llmOutputContract';

export const DesktopMarkdownRuntimeClient = Object.freeze({
  collectTextMatches,
  extractTextFromHtml,
  highlightPlainTextToHtml,
  highlightSanitizedHtml,
  toSanitizedMarkdownHtml,
  resolveLlmOutputContract,
});
