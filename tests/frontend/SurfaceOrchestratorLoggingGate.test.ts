import { shouldLogSurfaceTransitions } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/loggingGate';

describe('surfaceOrchestrator logging gate', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete (window as any).__WINDIE_VERBOSE_TOOL_LOGS__;
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    delete (window as any).__WINDIE_VERBOSE_TOOL_LOGS__;
  });

  test('suppresses logs in production by default', () => {
    process.env.NODE_ENV = 'production';
    expect(shouldLogSurfaceTransitions()).toBe(false);
  });

  test('suppresses logs in test by default', () => {
    process.env.NODE_ENV = 'test';
    expect(shouldLogSurfaceTransitions()).toBe(false);
  });

  test('emits logs in development by default', () => {
    process.env.NODE_ENV = 'development';
    expect(shouldLogSurfaceTransitions()).toBe(true);
  });

  test('window verbose override can force logs on in production', () => {
    process.env.NODE_ENV = 'production';
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = true;
    expect(shouldLogSurfaceTransitions()).toBe(true);
  });

  test('window verbose override can force logs off in development', () => {
    process.env.NODE_ENV = 'development';
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = false;
    expect(shouldLogSurfaceTransitions()).toBe(false);
  });
});
