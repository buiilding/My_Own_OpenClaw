/**
 * Coordinates markdown, find highlighting, and LLM output normalization for renderer chat clients.
 */

export {
  collectTextMatches,
  extractTextFromHtml,
  highlightPlainTextToHtml,
  highlightSanitizedHtml,
  toSanitizedMarkdownHtml,
} from '../../infrastructure/markdown';
export {
  resolveLlmOutputContract,
} from '../../infrastructure/llmOutputContract';
