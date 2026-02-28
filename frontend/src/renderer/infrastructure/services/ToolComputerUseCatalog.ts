/**
 * Canonical computer-use tool name catalog used by surface orchestration and capture policy.
 * Keep these lists in one place to avoid drift between mode resolution and capture checks.
 */

export const INTERACTIVE_COMPUTER_USE_TOOLS = Object.freeze([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'click',
  'type',
  'scroll',
]);

export const CAPTURE_ONLY_COMPUTER_USE_TOOLS = Object.freeze([
  'screenshot',
  'switch_tab',
  'wait',
]);

export const STANDARD_COMPUTER_USE_TOOLS = Object.freeze([
  ...INTERACTIVE_COMPUTER_USE_TOOLS,
  ...CAPTURE_ONLY_COMPUTER_USE_TOOLS,
]);
