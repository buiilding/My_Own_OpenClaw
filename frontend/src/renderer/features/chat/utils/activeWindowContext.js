const DEFAULT_CONTEXT = Object.freeze({
  label: 'No active app',
  icon: '--',
  fullLabel: 'No active app',
});
const MAX_CONTEXT_LABEL_LENGTH = 26;

const APP_RULES = [
  { match: /\b(chrome|chromium|edge|firefox|safari|browser)\b/i, label: 'Chrome', icon: 'WB' },
  { match: /\b(visual studio code|vscode|cursor|windsurf|sublime|notepad\+\+|intellij|pycharm|webstorm)\b/i, label: 'Code', icon: 'ED' },
  { match: /\b(terminal|iterm|powershell|cmd|command prompt|gnome-terminal|alacritty|kitty)\b/i, label: 'Terminal', icon: 'SH' },
  { match: /\b(outlook|gmail|mail|thunderbird)\b/i, label: 'Mail', icon: 'ML' },
  { match: /\b(slack|discord|teams|telegram)\b/i, label: 'Chat', icon: 'CM' },
  { match: /\b(figma|sketch|adobe xd|photoshop)\b/i, label: 'Design', icon: 'UI' },
  { match: /\b(word|docs|notion|obsidian|confluence)\b/i, label: 'Docs', icon: 'DC' },
];

function abbreviateLabel(label) {
  if (label.length <= MAX_CONTEXT_LABEL_LENGTH) {
    return label;
  }
  return `${label.slice(0, MAX_CONTEXT_LABEL_LENGTH - 1)}…`;
}

function normalizeSegments(activeWindowValue) {
  return activeWindowValue
    .split(/\s[-|:]\s/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolveFallbackContext(trimmedValue) {
  const segments = normalizeSegments(trimmedValue);
  const preferredSegment = segments.length > 0 ? segments[segments.length - 1] : trimmedValue;
  const fallbackLabel = abbreviateLabel(preferredSegment);
  const plain = preferredSegment.replace(/[^A-Za-z0-9 ]/g, '').trim();
  const icon = plain.length > 1
    ? plain.slice(0, 2).toUpperCase()
    : (plain.toUpperCase() || 'AP');

  return {
    label: fallbackLabel,
    icon,
    fullLabel: preferredSegment || trimmedValue,
  };
}

export function resolveActiveWindowContext(activeWindowValue) {
  if (typeof activeWindowValue !== 'string') {
    return DEFAULT_CONTEXT;
  }

  const trimmedValue = activeWindowValue.trim();
  if (!trimmedValue) {
    return DEFAULT_CONTEXT;
  }

  for (const rule of APP_RULES) {
    if (rule.match.test(trimmedValue)) {
      return {
        label: rule.label,
        icon: rule.icon,
        fullLabel: trimmedValue,
      };
    }
  }

  return resolveFallbackContext(trimmedValue);
}

