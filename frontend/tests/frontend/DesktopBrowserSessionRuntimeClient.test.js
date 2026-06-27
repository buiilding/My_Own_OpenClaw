/**
 * Covers desktop browser session runtime client presentation helpers.
 */

jest.mock('../../src/renderer/infrastructure/runtime/browserSessionStore', () => ({
  connectBrowserSession: jest.fn(),
  disconnectBrowserSession: jest.fn(),
  enableInteractiveBrowserSessionPolling: jest.fn(() => jest.fn()),
  getBrowserSessionSnapshot: jest.fn(() => ({
    localRuntimeReady: false,
    connected: false,
    currentTargetId: '',
    currentTabLabel: '',
    currentTabTitle: '',
    currentTabUrl: '',
    tabs: [],
    busyAction: '',
    error: '',
  })),
  subscribeBrowserSessionStore: jest.fn(() => jest.fn()),
  switchBrowserSessionTab: jest.fn(),
}));

const {
  DesktopBrowserSessionRuntimeClient,
} = require('../../src/renderer/app/runtime/desktopBrowserSessionRuntimeClient');

const browserSessionCopy = Object.freeze({
  connectTitle: 'Connect dedicated browser',
  connectLabel: 'Connect browser',
  connectingLabel: 'Connecting browser...',
  unavailableLabel: 'Browser unavailable',
  startingRuntimeLabel: 'Starting local runtime...',
  connectedLabelPrefix: 'Browser Tab:',
  tabFallbackLabel: 'New tab',
});

describe('DesktopBrowserSessionRuntimeClient', () => {
  test('builds disconnected browser control presentation from runtime readiness and error state', () => {
    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionControlPresentation({
        localRuntimeReady: false,
        connected: false,
        currentTabLabel: '',
        busyAction: '',
        error: '',
        tabs: [],
      }, browserSessionCopy),
    ).toEqual(expect.objectContaining({
      buttonTitle: 'Connect dedicated browser',
      controlsDisabled: true,
      disconnectedButtonLabel: 'Connect browser',
      disconnectedButtonText: 'Starting local runtime...',
    }));

    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionControlPresentation({
        localRuntimeReady: false,
        connected: false,
        currentTabLabel: '',
        busyAction: '',
        error: 'daemon unavailable',
        tabs: [],
      }, browserSessionCopy),
    ).toEqual(expect.objectContaining({
      buttonTitle: 'daemon unavailable',
      controlsDisabled: true,
      disconnectedButtonLabel: 'Browser unavailable',
      disconnectedButtonText: 'Browser unavailable',
    }));

    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionControlPresentation({
        localRuntimeReady: true,
        connected: false,
        currentTabLabel: '',
        busyAction: 'connect',
        error: '',
        tabs: [],
      }, browserSessionCopy),
    ).toEqual(expect.objectContaining({
      controlsDisabled: true,
      disconnectedButtonLabel: 'Connect browser',
      disconnectedButtonText: 'Connecting browser...',
    }));
  });

  test('builds connected browser control presentation from current tab state', () => {
    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionControlPresentation({
        localRuntimeReady: true,
        connected: true,
        currentTabLabel: 'Docs',
        currentTabTitle: 'Docs title',
        currentTabUrl: 'https://docs.example.com',
        busyAction: '',
        error: '',
        tabs: [
          { targetId: '0', label: 'Docs' },
          { targetId: '1', label: 'GitHub' },
        ],
      }, browserSessionCopy),
    ).toEqual(expect.objectContaining({
      buttonTitle: 'Docs title',
      canOpenPicker: true,
      controlsDisabled: false,
      hasMultipleTabs: true,
      tabControlLabel: 'Browser Tab: Docs',
      tabLabel: 'Docs',
    }));

    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionControlPresentation({
        localRuntimeReady: true,
        connected: true,
        currentTabLabel: '',
        currentTabTitle: '',
        currentTabUrl: 'https://example.com',
        busyAction: '',
        error: '',
        tabs: [],
      }, browserSessionCopy),
    ).toEqual(expect.objectContaining({
      buttonTitle: 'https://example.com',
      hasMultipleTabs: false,
      tabControlLabel: 'Browser Tab: New tab',
      tabLabel: 'New tab',
    }));
  });

  test('resolves carousel tab targets without exposing tab-index math to feature components', () => {
    const snapshot = {
      currentTargetId: '1',
      tabs: [
        { targetId: '0', label: 'Docs' },
        { targetId: '1', label: 'GitHub' },
        { targetId: '2', label: 'Settings' },
      ],
    };

    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionCarouselTargetId(snapshot, 1),
    ).toBe('2');
    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionCarouselTargetId(snapshot, -1),
    ).toBe('0');
    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionCarouselTargetId({
        currentTargetId: 'missing',
        tabs: snapshot.tabs,
      }, -1),
    ).toBe('2');
    expect(
      DesktopBrowserSessionRuntimeClient.resolveBrowserSessionCarouselTargetId({
        currentTargetId: '0',
        tabs: [{ targetId: '0', label: 'Only tab' }],
      }, 1),
    ).toBe('');
  });
});
