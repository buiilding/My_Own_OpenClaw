type LlmOutputRenderSource = 'markdown' | 'structured-json';

interface LlmOutputContractOptions {
  provider?: string | null;
  modelId?: string | null;
  enableMath?: boolean;
  stripAccidentalHtmlTokens?: boolean;
}

interface LlmOutputContract {
  markdown: string;
  source: LlmOutputRenderSource;
  provider: string;
  modelId: string;
  mathEnabled: boolean;
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeProvider(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function mapOutsideFencedCodeBlocks(input: string, transform: (segment: string) => string): string {
  const segments = input.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment) => (segment.startsWith('```') ? segment : transform(segment)))
    .join('');
}

function replaceLatexDelimitedMath(
  input: string,
  openDelimiter: string,
  closeDelimiter: string,
  render: (expression: string) => string,
): string {
  let normalized = '';
  let cursor = 0;

  while (cursor < input.length) {
    const start = input.indexOf(openDelimiter, cursor);
    if (start === -1) {
      normalized += input.slice(cursor);
      break;
    }

    const end = input.indexOf(closeDelimiter, start + openDelimiter.length);
    if (end === -1) {
      normalized += input.slice(cursor);
      break;
    }

    normalized += input.slice(cursor, start);
    const expression = input.slice(start + openDelimiter.length, end).trim();
    normalized += expression ? render(expression) : '';
    cursor = end + closeDelimiter.length;
  }

  return normalized;
}

function normalizeLatexMathDelimiters(input: string): string {
  return mapOutsideFencedCodeBlocks(input, (segment) => {
    let normalized = segment;
    normalized = normalized.replace(/\\\\\(/g, '\\(');
    normalized = normalized.replace(/\\\\\)/g, '\\)');
    normalized = normalized.replace(/\\\\\[/g, '\\[');
    normalized = normalized.replace(/\\\\\]/g, '\\]');
    normalized = replaceLatexDelimitedMath(
      normalized,
      '\\[',
      '\\]',
      (expression) => `\n$$\n${expression}\n$$\n`,
    );
    normalized = replaceLatexDelimitedMath(
      normalized,
      '\\(',
      '\\)',
      (expression) => `$${expression}$`,
    );
    return normalized;
  });
}

function stripAccidentalHtmlWrappers(input: string): string {
  let normalized = input.replace(/<br\s*\/?>/gi, '\n');
  const wrapperPattern = /^\s*<(?:html|body|main|article|section|div|p)\b[^>]*>\s*|\s*<\/(?:html|body|main|article|section|div|p)>\s*$/gi;
  let previous = '';
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(wrapperPattern, '');
  }
  return normalized;
}

function normalizeGeminiTransportArtifacts(input: string, stripAccidentalHtmlTokens: boolean): string {
  let normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  normalized = normalized
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
  if (stripAccidentalHtmlTokens) {
    normalized = stripAccidentalHtmlWrappers(normalized);
  }
  return normalized;
}

function readStructuredContentFromBlocks(blocks: unknown[]): string {
  const lines: string[] = [];

  blocks.forEach((block) => {
    if (typeof block === 'string') {
      if (block.trim()) {
        lines.push(block.trim());
      }
      return;
    }
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }

    const candidate = block as Record<string, unknown>;
    const type = normalizeString(candidate.type).toLowerCase();

    if (type === 'heading') {
      const text = normalizeString(candidate.text || candidate.content || candidate.value);
      if (!text) {
        return;
      }
      const level = Number(candidate.level);
      const safeLevel = Number.isFinite(level) ? Math.max(1, Math.min(6, Math.floor(level))) : 2;
      lines.push(`${'#'.repeat(safeLevel)} ${text}`);
      return;
    }

    if (type === 'list') {
      const items = Array.isArray(candidate.items) ? candidate.items : [];
      const listLines = items
        .map((item) => normalizeString(item))
        .filter(Boolean)
        .map((item) => `- ${item}`);
      if (listLines.length > 0) {
        lines.push(listLines.join('\n'));
      }
      return;
    }

    if (type === 'code') {
      const text = normalizeString(candidate.text || candidate.content || candidate.value);
      if (!text) {
        return;
      }
      const language = normalizeString(candidate.language || candidate.lang);
      lines.push(`\`\`\`${language}\n${text}\n\`\`\``);
      return;
    }

    if (type === 'math') {
      const text = normalizeString(candidate.text || candidate.content || candidate.value);
      if (!text) {
        return;
      }
      const display = candidate.display === true;
      lines.push(display ? `$$\n${text}\n$$` : `$${text}$`);
      return;
    }

    if (type === 'quote') {
      const text = normalizeString(candidate.text || candidate.content || candidate.value);
      if (!text) {
        return;
      }
      lines.push(text.split('\n').map((line) => `> ${line}`).join('\n'));
      return;
    }

    const text = normalizeString(candidate.text || candidate.content || candidate.value);
    if (!text) {
      return;
    }
    lines.push(text);
  });

  return lines.join('\n\n').trim();
}

function tryStructuredJsonToMarkdown(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed === 'string') {
    return parsed.trim() || null;
  }

  if (Array.isArray(parsed)) {
    const items = parsed
      .map((item) => normalizeString(item))
      .filter(Boolean);
    return items.length > 0 ? items.join('\n') : null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const payload = parsed as Record<string, unknown>;
  const direct =
    normalizeString(payload.markdown)
    || normalizeString(payload.content)
    || normalizeString(payload.text)
    || normalizeString(payload.answer)
    || normalizeString(payload.output);
  if (direct) {
    return direct;
  }

  if (Array.isArray(payload.blocks)) {
    const blockMarkdown = readStructuredContentFromBlocks(payload.blocks);
    if (blockMarkdown) {
      return blockMarkdown;
    }
  }

  return null;
}

function isGeminiProvider(provider: string): boolean {
  return provider === 'gemini' || provider === 'google';
}

export function resolveLlmOutputContract(
  rawText: string,
  options: LlmOutputContractOptions = {},
): LlmOutputContract {
  const provider = normalizeProvider(options.provider);
  const modelId = normalizeString(options.modelId);
  const mathEnabled = options.enableMath !== false;
  const stripAccidentalHtmlTokens = options.stripAccidentalHtmlTokens !== false;

  const baseText = typeof rawText === 'string' ? rawText : '';
  const structuredMarkdown = tryStructuredJsonToMarkdown(baseText);
  const source: LlmOutputRenderSource = structuredMarkdown ? 'structured-json' : 'markdown';
  let markdown = structuredMarkdown || baseText;

  if (isGeminiProvider(provider)) {
    markdown = normalizeGeminiTransportArtifacts(markdown, stripAccidentalHtmlTokens);
  }
  markdown = normalizeLatexMathDelimiters(markdown);

  return {
    markdown,
    source,
    provider,
    modelId,
    mathEnabled,
  };
}
