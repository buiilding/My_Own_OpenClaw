import {
  WindieClient,
  WindieSdkClient,
  moduleTool,
} from '../../packages/windie-sdk-js/src';

describe('@windie/sdk package boundary', () => {
  test('exports the public agent runtime surface', () => {
    expect(WindieClient).toBeDefined();
    expect(WindieSdkClient).toBeDefined();
    expect(moduleTool({
      name: 'save_note',
      module: 'example.tools:save_note',
      schema: { type: 'object', properties: {} },
    })).toMatchObject({
      name: 'save_note',
      execution_target: 'sidecar',
      argument_resolution: 'passthrough',
    });
  });
});
