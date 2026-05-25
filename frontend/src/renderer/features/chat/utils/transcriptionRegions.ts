type TranscriptionRegion = {
  start: number;
  end: number;
  active: boolean;
};

export function createEmptyTranscriptionRegion(): TranscriptionRegion {
  return {
    start: 0,
    end: 0,
    active: false,
  };
}

export function appendTranscriptionText(currentValue: string, transcriptionText: string): { value: string; region: TranscriptionRegion } {
  const value = currentValue + transcriptionText;
  return {
    value,
    region: {
      start: currentValue.length,
      end: value.length,
      active: true,
    },
  };
}

export function replaceTranscriptionText(
  currentValue: string,
  region: TranscriptionRegion,
  transcriptionText: string,
): { value: string; region: TranscriptionRegion } {
  const before = currentValue.substring(0, region.start);
  const after = currentValue.substring(region.end);
  const value = before + transcriptionText + after;

  return {
    value,
    region: {
      start: before.length,
      end: before.length + transcriptionText.length,
      active: true,
    },
  };
}

export function updateRegionAfterInputChange(
  region: TranscriptionRegion,
  oldValue: string,
  newValue: string,
  cursorPosition: number | null,
): TranscriptionRegion {
  if (!region.active) {
    return region;
  }

  if (cursorPosition === null) {
    return createEmptyTranscriptionRegion();
  }

  const diff = newValue.length - oldValue.length;
  if (cursorPosition <= region.start) {
    return {
      start: region.start + diff,
      end: region.end + diff,
      active: true,
    };
  }

  if (cursorPosition >= region.end) {
    return region;
  }

  return createEmptyTranscriptionRegion();
}

export function buildValueAfterPaste(
  currentValue: string,
  pastedText: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { value: string; start: number } {
  const start = selectionStart || 0;
  const end = selectionEnd ?? selectionStart ?? 0;
  return {
    value: currentValue.substring(0, start) + pastedText + currentValue.substring(end),
    start,
  };
}

export function updateRegionAfterPaste(
  region: TranscriptionRegion,
  selectionStart: number | null,
  selectionEnd: number | null,
  pastedTextLength: number,
): TranscriptionRegion {
  if (!region.active) {
    return region;
  }

  if (selectionStart === null) {
    return createEmptyTranscriptionRegion();
  }

  const replacementStart = selectionStart;
  const replacementEnd = selectionEnd ?? selectionStart;
  const removedLength = Math.max(0, replacementEnd - replacementStart);
  const lengthDelta = pastedTextLength - removedLength;

  if (replacementEnd <= region.start) {
    return {
      start: region.start + lengthDelta,
      end: region.end + lengthDelta,
      active: true,
    };
  }

  if (replacementStart >= region.end) {
    return region;
  }

  return createEmptyTranscriptionRegion();
}
