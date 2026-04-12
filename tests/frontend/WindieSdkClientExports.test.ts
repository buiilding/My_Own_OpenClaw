import {
  ApiClient,
  WindieSdkClient,
} from '../../frontend/src/renderer/infrastructure/api';

describe('renderer api exports', () => {
  test('exports both the app ipc client and the hosted sdk client', () => {
    expect(ApiClient).toBeDefined();
    expect(WindieSdkClient).toBeDefined();
  });
});
