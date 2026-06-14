/**
 * Provides the incoming text normalization module for the renderer UI.
 */

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ['â€œ', '“'],
  ['â€\u009d', '”'],
  ['â€˜', '‘'],
  ['â€™', '’'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€¦', '…'],
  ['â€¢', '•'],
  ['Â\u00A0', ' '],
  ['Â ', ' '],
];

function replaceLoneSurrogates(value: string): string {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    const isHighSurrogate = codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
    const isLowSurrogate = codeUnit >= 0xDC00 && codeUnit <= 0xDFFF;

    if (!isHighSurrogate && !isLowSurrogate) {
      normalized += value[index];
      continue;
    }

    if (isHighSurrogate) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      const nextIsLowSurrogate = nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF;
      if (nextIsLowSurrogate) {
        normalized += value[index] + value[index + 1];
        index += 1;
        continue;
      }
    }

    normalized += '\uFFFD';
  }

  return normalized;
}

function repairCommonMojibake(value: string): string {
  let repaired = value;
  for (const [needle, replacement] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(needle).join(replacement);
  }
  return repaired;
}

export function normalizeIncomingText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return replaceLoneSurrogates(repairCommonMojibake(value));
}

export function normalizeOptionalIncomingText(value: unknown): string | null {
  const normalized = normalizeIncomingText(value).trim();
  return normalized.length > 0 ? normalized : null;
}
