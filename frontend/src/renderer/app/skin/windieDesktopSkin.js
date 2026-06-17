/**
 * Defines the WindieOS renderer skin for the generic desktop agent UI.
 */

const productName = 'WindieOS';
const browserName = 'Windie Browser';

export const windieDesktopSkin = Object.freeze({
  productName,
  settings: Object.freeze({
    agent: Object.freeze({
      title: 'Agent',
      customInstructions: Object.freeze({
        label: 'Custom instructions',
        description: 'Saved locally and included with each workspace query.',
      }),
      extensions: Object.freeze({
        label: 'Extensions',
        description: 'Extension contributions are grouped by tools, prompt skills, and MCP servers.',
        emptyPlugins: 'No local tool plugins loaded',
      }),
      localTools: Object.freeze({
        label: 'Local tools',
        description: 'These are included in the client tool manifest when enabled.',
        ids: Object.freeze([
          'mouse_control',
          'keyboard_control',
          'screenshot',
          'scroll_control',
          'switch_window',
          'wait',
          'get_open_windows',
          'get_system_stats',
          'open_app',
          'run_shell_command',
          'process',
          'read_file',
          'replace',
          'browser',
        ]),
      }),
      remoteTools: Object.freeze({
        label: 'Cloud tools',
        description: `These execute through the hosted ${productName} runtime when available.`,
        ids: Object.freeze([
          'web_search',
        ]),
      }),
      toolAcceptance: Object.freeze({
        pending: 'Waiting for runtime acceptance',
        rejectedPrefix: 'Rejected',
        acceptedSummary: 'Accepted schema',
        argumentResolutionFallback: 'passthrough',
        executionTargetLabels: Object.freeze({
          backend: 'cloud runtime',
          sidecar: 'local runtime',
        }),
      }),
    }),
    general: Object.freeze({
      title: 'General',
      wakeword: Object.freeze({
        label: 'Wakeword Listening (Hey Jarvis)',
        description: 'Allow wakeword detection when the chat pill is hidden.',
        suppressedDescription: 'Listening is paused while the chatbox is visible.',
      }),
      speechAfterWakeword: Object.freeze({
        label: 'Speech-To-Text After "Hey Jarvis"',
        description: 'After wakeword, open chat pill and transcribe speech into the input field.',
      }),
      toolLogs: Object.freeze({
        label: 'View tool logs',
        description: `Show raw tool-call and tool-output cards in chat. When off, ${productName} shows only subdued action explanations and collapses them into a View actions summary after the loop completes.`,
      }),
      globalStopShortcut: Object.freeze({
        label: 'Global Stop Shortcut',
        descriptionPrefix: 'Ends the active agent loop from anywhere. Current binding:',
        fallbackPrefix: `Requested shortcut unavailable on this system. ${productName} switched to`,
        fallbackSuffix: 'and saved that binding locally.',
        registrationFailure: 'Global stop shortcut could not be registered. Choose another binding if you need stop-from-anywhere behavior.',
        focusedWindowHint: 'Focused chat and dashboard windows still support Esc for stop.',
      }),
    }),
    browser: Object.freeze({
      title: 'Browser',
      browserName,
      description: `Open the dedicated browser profile ${productName} uses for sign-in state, browsing, navigation, and web tasks.`,
      actionLabel: `Open ${browserName}`,
      actionDescription: `Reopen the persistent browser window ${productName} manages so you can sign in or verify the session it should reuse later.`,
      openingLabel: 'Opening...',
      openErrorFallback: `Unable to open ${browserName}.`,
      openErrorPrefix: `Unable to open ${browserName}:`,
    }),
    workspace: Object.freeze({
      title: 'Workspace',
      activeWorkspaceLabel: 'Active workspace',
      description: `${productName} uses the active workspace as the default folder for file reads, shell commands, and repo-aware tasks when a tool call does not provide its own directory.`,
      emptyWorkspace: 'No workspace selected yet.',
      changeWorkspaceLabel: 'Change workspace',
      selectingWorkspaceLabel: 'Opening...',
      updatedFallback: 'Active workspace updated.',
      updateFailureFallback: 'Failed to change active workspace.',
    }),
    memory: Object.freeze({
      title: 'Memory',
      deleteMemories: Object.freeze({
        label: 'Delete saved memories',
        description: 'Deletes saved episodic interaction memories and semantic memories. Chat transcripts remain.',
        actionLabel: 'Delete memories',
        pendingLabel: 'Deleting...',
        confirmMessage: 'Delete saved episodic interaction memories and semantic memories? Chat transcripts will be kept.',
        successMessage: 'Saved memories deleted.',
      }),
      deleteChats: Object.freeze({
        label: 'Delete chat history',
        description: 'Deletes saved chat transcripts, revisions, and titles. Memories remain.',
        actionLabel: 'Delete chats',
        pendingLabel: 'Deleting...',
        confirmMessage: 'Delete saved chat transcripts, revisions, and titles? Memories will be kept.',
        successMessage: 'Chat history deleted.',
      }),
      requireUserMessage: `Connect ${productName} before deleting saved data.`,
      destructiveFailureFallback: 'Failed to complete destructive action',
    }),
  }),
  memoryPanel: Object.freeze({
    title: 'Memory',
    subtitle: `${productName} builds understanding from every interaction`,
    closeLabel: 'Close memory',
    retrievalToggleLabel: 'Memory on or off',
    retrievalStateLabel: Object.freeze({
      enabled: 'Memory On',
      disabled: 'Memory Off',
    }),
    searchPlaceholder: 'Search memories...',
    clearSearchLabel: 'Clear search',
    loadingLabel: 'Loading memories...',
    loadFailureFallback: 'Failed to load memories',
    deleteFailurePrefix: 'Failed to delete',
    emptyTitle: 'No memories found',
    emptySearchSubtitle: 'Try a different search term',
    emptyDefaultSubtitle: `Memories will appear as you interact with ${productName}`,
  }),
  onboarding: Object.freeze({
    dialogLabel: `${productName} onboarding`,
    missingPermissionsMessage: `${productName} could not find any onboarding permissions for this platform.`,
    loadingPermissionsMessage: `${productName} is still loading permission status. Wait a moment and try again.`,
    missingRequiredPermissionsMessage: 'Some permissions are still missing. You can continue now and grant them later in Settings.',
    startLabel: `Start ${productName}`,
  }),
  chat: Object.freeze({
    emptyTitle: `Welcome to ${productName} Demo`,
    sendFailureMessage: `Your message wasn't sent because ${productName} isn't connected right now. Try again when the connection is restored.`,
    replayPreparationFailureMessage: `Your message was not resent because ${productName} could not prepare the conversation replay. Try reopening the chat and sending again.`,
    browserSession: Object.freeze({
      connectTitle: `Connect the dedicated ${browserName}`,
      connectLabel: 'Connect browser',
      connectingLabel: 'Connecting browser…',
      unavailableLabel: 'Browser unavailable',
      startingRuntimeLabel: 'Starting local runtime…',
      connectedLabelPrefix: 'Browser Tab:',
      tabFallbackLabel: 'New tab',
      carouselLabel: 'Browser tab carousel',
      previousTabLabel: 'Previous browser tab',
      nextTabLabel: 'Next browser tab',
      disconnectLabel: 'Disconnect browser',
    }),
  }),
  runtime: Object.freeze({
    sendCommandFailure: `Failed to send command to ${productName} runtime`,
  }),
});

export function formatToolAcceptanceRuntimeSummary(acceptedTool) {
  const config = windieDesktopSkin.settings.agent.toolAcceptance;
  const argumentResolution = acceptedTool?.argument_resolution || config.argumentResolutionFallback;
  const executionTarget = acceptedTool?.execution_target || '';
  const executionTargetLabel = config.executionTargetLabels[executionTarget] || executionTarget || 'runtime';
  return `${argumentResolution} / ${executionTargetLabel}`;
}
