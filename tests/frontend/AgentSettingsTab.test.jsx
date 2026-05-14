import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

let backendHandler = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (_channel, handler) => {
      backendHandler = handler;
      return () => {
        backendHandler = null;
      };
    },
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
  },
}));

import AgentSettingsTab from '../../frontend/src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab';

describe('AgentSettingsTab', () => {
  beforeEach(() => {
    backendHandler = null;
  });

  test('updates tool toggles and displays accepted schemas plus prompt layers', () => {
    const onConfigChange = jest.fn();
    render(
      <AgentSettingsTab
        config={{
          agent_custom_instructions: 'Prefer local tools.',
          agent_disabled_local_tools: [],
          agent_disabled_remote_tools: [],
          agent_coordinate_methods: ['manual', 'ocr', 'prediction'],
        }}
        onConfigChange={onConfigChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Enable browser'));
    expect(onConfigChange).toHaveBeenCalledWith({
      agent_disabled_local_tools: ['browser'],
    });

    act(() => {
      backendHandler({
        type: 'client-tool-manifest',
        payload: {
          accepted: [{
            name: 'read_file',
            execution_target: 'sidecar',
            argument_resolution: 'passthrough',
            model_schema: { type: 'object', properties: { file_path: { type: 'string' } } },
            execution_schema: { type: 'object', properties: { file_path: { type: 'string' } } },
          }],
          rejected: [],
        },
      });
      backendHandler({
        type: 'system-prompt',
        payload: {
          client_prompt_layers: [{
            id: 'custom-instructions',
            type: 'custom_instructions',
            priority: 60,
            content: 'Prefer local tools.',
          }],
        },
      });
    });

    expect(screen.getByText('custom-instructions')).toBeInTheDocument();
    expect(screen.getByText('Accepted schema')).toBeInTheDocument();
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
  });
});
