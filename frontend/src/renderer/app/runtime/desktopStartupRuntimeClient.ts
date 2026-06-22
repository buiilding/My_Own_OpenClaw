/**
 * Exposes renderer startup mode state through the desktop app runtime boundary.
 */

import { isVmModeEnabled } from '../../infrastructure/runtime/vmMode';

export type RendererEntrypointView =
  | 'main'
  | 'minimal-chat-pill'
  | 'minimal-response-overlay'
  | 'tool-ghost-debug';

const RENDERER_ENTRYPOINT_VIEWS = new Set<RendererEntrypointView>([
  'minimal-chat-pill',
  'minimal-response-overlay',
  'tool-ghost-debug',
]);

function resolveRendererSearch(windowApi: Pick<Window, 'location'> | null | undefined = globalThis.window): string {
  return typeof windowApi?.location?.search === 'string' ? windowApi.location.search : '';
}

function getRendererEntrypointView(
  windowApi?: Pick<Window, 'location'> | null,
): RendererEntrypointView {
  try {
    const view = new URLSearchParams(resolveRendererSearch(windowApi)).get('view');
    return RENDERER_ENTRYPOINT_VIEWS.has(view as RendererEntrypointView)
      ? view as RendererEntrypointView
      : 'main';
  } catch (_error) {
    return 'main';
  }
}

function shouldSuppressWakewordOnStartup(
  windowApi?: Pick<Window, 'location'> | null,
): boolean {
  return getRendererEntrypointView(windowApi) !== 'main';
}

function getRendererRootElement(
  documentApi: Pick<Document, 'getElementById'> | null | undefined = globalThis.document,
): HTMLElement | null {
  return documentApi?.getElementById('root') ?? null;
}

export const DesktopStartupRuntimeClient = {
  getRendererEntrypointView,
  getRendererRootElement,
  isVmModeEnabled,
  shouldSuppressWakewordOnStartup,
};
