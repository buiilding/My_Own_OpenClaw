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
  modelProvider = null,
  modelId = null,
}) {
  const contract = resolveLlmOutputContract(text ?? '', {
    provider: sender === 'assistant' ? modelProvider : null,
    modelId: sender === 'assistant' ? modelId : null,
    enableMath: sender === 'assistant',
    stripAccidentalHtmlTokens: sender === 'assistant',
  });
  const html = toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled });
  return {
    contract,
    html,
    plainText: extractTextFromHtml(html),
  };
}
