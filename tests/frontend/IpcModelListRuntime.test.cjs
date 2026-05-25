/** @jest-environment node */

const {
  createModelListRequestRuntime,
} = require('../../frontend/src/main/ipc/ipc_model_list_runtime.cjs');

describe('ipc_model_list_runtime', () => {
  test('flush is a no-op until a request is queued', () => {
    const runtime = createModelListRequestRuntime();
    const sendSdkRuntimeCommand = jest.fn();

    expect(runtime.flush({ runtime: {}, sendSdkRuntimeCommand })).toBeNull();
    expect(sendSdkRuntimeCommand).not.toHaveBeenCalled();
  });

  test('flush sends one list-models command and clears the queue on success', () => {
    const runtime = createModelListRequestRuntime();
    const backendRuntime = {};
    const sendSdkRuntimeCommand = jest.fn(() => 'models-1');

    runtime.queue();

    expect(runtime.hasPending()).toBe(true);
    expect(runtime.flush({
      runtime: backendRuntime,
      sendSdkRuntimeCommand,
    })).toBe('models-1');
    expect(sendSdkRuntimeCommand).toHaveBeenCalledWith(backendRuntime, {
      type: 'list-models',
      payload: {},
    });
    expect(runtime.hasPending()).toBe(false);
  });

  test('flush keeps the queue when backend send fails', () => {
    const runtime = createModelListRequestRuntime();
    const sendSdkRuntimeCommand = jest.fn(() => null);

    runtime.queue();

    expect(runtime.flush({ runtime: {}, sendSdkRuntimeCommand })).toBeNull();
    expect(runtime.hasPending()).toBe(true);
  });
});
