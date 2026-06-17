/**
 * Provides the markdown message rendering module for the renderer UI.
 */

import {
  extractTextFromHtml,
  toSanitizedMarkdownHtml,
} from '../../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../../infrastructure/llmOutputContract';

export function buildMarkdownRenderModel({
  text,
  sender = 'assistant',
}) {
  const contract = resolveLlmOutputContract(text ?? '', {
    enableMath: sender === 'assistant',
    normalizeTransportArtifacts: sender === 'assistant',
    stripAccidentalHtmlTokens: sender === 'assistant',
  });
  const html = toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled });
  return {
    contract,
    html,
    plainText: extractTextFromHtml(html),
  };
}
