/**
 * Keyboard Control Tool - Node.js implementation using nut-js
 */

const { keyboard, Key, Modifiers } = require('@nut-tree/nut-js');

// Module-level lock to serialize keyboard operations
let keyboardLock = null;

function getKeyboardLock() {
  if (!keyboardLock) {
    keyboardLock = { locked: false, queue: [] };
  }
  return keyboardLock;
}

/**
 * Acquire keyboard lock (simple mutex)
 */
async function acquireKeyboardLock() {
  const lock = getKeyboardLock();
  return new Promise((resolve) => {
    if (!lock.locked) {
      lock.locked = true;
      resolve();
    } else {
      lock.queue.push(resolve);
    }
  });
}

/**
 * Release keyboard lock
 */
function releaseKeyboardLock() {
  const lock = getKeyboardLock();
  lock.locked = false;
  if (lock.queue.length > 0) {
    const next = lock.queue.shift();
    lock.locked = true;
    next();
  }
}

/**
 * Map key string to nut-js Key
 */
function getKey(keyString) {
  const keyMap = {
    'enter': Key.Enter,
    'tab': Key.Tab,
    'space': Key.Space,
    'backspace': Key.Backspace,
    'delete': Key.Delete,
    'escape': Key.Escape,
    'up': Key.Up,
    'down': Key.Down,
    'left': Key.Left,
    'right': Key.Right,
    'home': Key.Home,
    'end': Key.End,
    'pageup': Key.PageUp,
    'pagedown': Key.PageDown,
    'f1': Key.F1,
    'f2': Key.F2,
    'f3': Key.F3,
    'f4': Key.F4,
    'f5': Key.F5,
    'f6': Key.F6,
    'f7': Key.F7,
    'f8': Key.F8,
    'f9': Key.F9,
    'f10': Key.F10,
    'f11': Key.F11,
    'f12': Key.F12,
  };

  const lowerKey = keyString.toLowerCase();
  return keyMap[lowerKey] || keyString;
}

/**
 * Execute keyboard control action
 */
async function executeKeyboardControl(args, skipAutoCapture) {
  const { action, text, key, keys } = args;

  try {
    // Acquire lock to serialize keyboard operations
    await acquireKeyboardLock();

    try {
      switch (action) {
        case 'type':
          if (!text) {
            return { success: false, error: 'text parameter required for type action' };
          }

          // Safety check: text length
          if (text.length > 10000) {
            return { success: false, error: `Text too long: ${text.length} characters (max 10000)` };
          }

          await keyboard.type(text);
          const textPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
          return {
            success: true,
            data: {
              action: 'type',
              input: textPreview,
              message: `Typed text: '${textPreview}'`,
              llm_content: `Typed text: '${textPreview}'`,
              return_display: `Typed text: '${textPreview}'`,
              metadata: {
                action: 'type',
                input_type: 'text',
                input_length: text.length,
              },
            },
          };

        case 'press':
          if (!key) {
            return { success: false, error: 'key parameter required for press action' };
          }

          const keyObj = getKey(key);
          if (typeof keyObj === 'string') {
            // Regular character
            await keyboard.type(keyObj);
          } else {
            // Special key
            await keyboard.pressKey(keyObj);
          }
          return {
            success: true,
            data: {
              action: 'press',
              input: key,
              message: `Pressed key: ${key}`,
              llm_content: `Pressed key: ${key}`,
              return_display: `Pressed key: ${key}`,
              metadata: {
                action: 'press',
                input_type: 'key',
                input_length: 1,
              },
            },
          };

        case 'hotkey':
          if (!keys || keys.length === 0) {
            return { success: false, error: 'keys parameter required for hotkey action' };
          }

          // Safety check for dangerous key combinations
          const dangerousCombos = [
            ['alt', 'f4'],
            ['ctrl', 'alt', 'del'],
            ['ctrl', 'shift', 'esc'],
          ];

          const keysLower = keys.map(k => k.toLowerCase());
          for (const combo of dangerousCombos) {
            if (combo.every(key => keysLower.includes(key))) {
              return { success: false, error: `Dangerous key combination blocked: ${combo.join(' + ')}` };
            }
          }

          // Build modifiers and main key
          const modifiers = [];
          let mainKey = null;
          
          for (const k of keys) {
            const keyLower = k.toLowerCase();
            if (keyLower === 'ctrl' || keyLower === 'control') {
              modifiers.push(Modifiers.LeftControl);
            } else if (keyLower === 'shift') {
              modifiers.push(Modifiers.LeftShift);
            } else if (keyLower === 'alt') {
              modifiers.push(Modifiers.LeftAlt);
            } else if (keyLower === 'meta' || keyLower === 'cmd') {
              modifiers.push(Modifiers.LeftSuper);
            } else {
              mainKey = getKey(k);
            }
          }

          if (!mainKey) {
            return { success: false, error: 'Hotkey must include a non-modifier key' };
          }

          // Press hotkey with modifiers
          if (modifiers.length > 0) {
            await keyboard.pressKey(mainKey, ...modifiers);
          } else {
            await keyboard.pressKey(mainKey);
          }
          
          return {
            success: true,
            data: {
              action: 'hotkey',
              input: keys.join(' + '),
              message: `Pressed hotkey: ${keys.join(' + ')}`,
              llm_content: `Pressed hotkey: ${keys.join(' + ')}`,
              return_display: `Pressed hotkey: ${keys.join(' + ')}`,
              metadata: {
                action: 'hotkey',
                input_type: 'keys',
                input_length: keys.length,
              },
            },
          };

        default:
          return { success: false, error: `Unknown keyboard action: ${action}` };
      }
    } finally {
      releaseKeyboardLock();
    }
  } catch (error) {
    console.error(`[KeyboardTool] Error: ${error.message}`, error);
    return { success: false, error: `Keyboard action failed: ${error.message}` };
  }
}

module.exports = {
  executeKeyboardControl,
};
