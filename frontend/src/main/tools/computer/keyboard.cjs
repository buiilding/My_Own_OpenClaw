/**
 * Keyboard Control Tool - Node.js implementation using nut-js
 */

const { loadNutJs } = require('../nutjs_loader.cjs');

/**
 * Map key string to nut-js Key enum
 */
function getKey(keyString, Key) {
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

  return keyMap[keyString.toLowerCase()] || keyString;
}

/**
 * Execute keyboard control action
 */
async function executeKeyboardControl(args, skipAutoCapture) {
  const { action, text, key, keys } = args;

  try {
    const nutjs = await loadNutJs();
    const { keyboard, Key, Modifiers } = nutjs;
    
    switch (action) {
      case 'type':
        if (!text) {
          return { success: false, error: 'text parameter required for type action' };
        }
        if (text.length > 10000) {
          return { success: false, error: `Text too long: ${text.length} characters (max 10000)` };
        }

        await keyboard.type(text);
        
        return {
          success: true,
          data: {
            action: 'type',
            input: text.length > 50 ? text.substring(0, 50) + '...' : text,
            message: `Typed text: '${text}'`,
            llm_content: `Typed text: '${text}'`,
            return_display: `Typed text: '${text}'`,
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

        const keyObj = getKey(key, Key);
        // For special keys, use pressKey + releaseKey to ensure proper keypress cycle
        await keyboard.pressKey(keyObj);
        await keyboard.releaseKey(keyObj);
        
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

        // Block dangerous key combinations
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

        // Parse modifiers and main key
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
            mainKey = getKey(k, Key);
          }
        }

        if (!mainKey) {
          return { success: false, error: 'Hotkey must include a non-modifier key' };
        }

        // For key combinations, press and release to ensure keys don't stay held
        await keyboard.pressKey(mainKey, ...modifiers);
        await keyboard.releaseKey(mainKey, ...modifiers);
        
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
  } catch (error) {
    console.error(`[KeyboardTool] Error: ${error.message}`, error);
    return { success: false, error: `Keyboard action failed: ${error.message}` };
  }
}

module.exports = {
  executeKeyboardControl,
};
