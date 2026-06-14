/**
 * Covers windie sdk client exports. behavior in the frontend test suite.
 */

import {
  WindieClient,
  WindieSdkClient,
} from '../../frontend/src/renderer/infrastructure/api';

describe('renderer api exports', () => {
  test('exports hosted sdk client surfaces without the removed app ipc client', () => {
    expect(WindieClient).toBeDefined();
    expect(WindieSdkClient).toBeDefined();
  });
});
