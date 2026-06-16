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
  }),
});

export function formatToolAcceptanceRuntimeSummary(acceptedTool) {
  const config = windieDesktopSkin.settings.agent.toolAcceptance;
  const argumentResolution = acceptedTool?.argument_resolution || config.argumentResolutionFallback;
  const executionTarget = acceptedTool?.execution_target || '';
  const executionTargetLabel = config.executionTargetLabels[executionTarget] || executionTarget || 'runtime';
  return `${argumentResolution} / ${executionTargetLabel}`;
}
