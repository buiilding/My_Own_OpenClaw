export function loadLocalValue(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch (error) {
    console.warn('[Dashboard] Failed to read localStorage:', error);
    return fallback;
  }
}

export function saveLocalValue(key, value) {
  try {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('[Dashboard] Failed to write localStorage:', error);
  }
}
