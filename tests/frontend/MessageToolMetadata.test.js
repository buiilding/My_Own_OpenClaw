import { buildToolExecutionMetadata } from '../../frontend/src/renderer/features/chat/utils/messageToolMetadata';

describe('buildToolExecutionMetadata', () => {
  test('builds metadata from tool output message fields', () => {
    expect(
      buildToolExecutionMetadata({
        toolName: 'click',
        executionTime: 1.23456,
        success: true,
        toolMetadata: { active_window: 'Browser' },
      }),
    ).toEqual({
      'Tool Name': 'click',
      'Execution Time': '1.235s',
      Success: 'Yes',
      'Active Window': 'Browser',
    });
  });

  test('defaults metadata values when fields are missing', () => {
    expect(buildToolExecutionMetadata({})).toEqual({
      'Tool Name': 'Unknown',
      'Execution Time': 'N/A',
      Success: 'No',
      'Active Window': 'Unknown',
    });
  });

  test('formats zero execution time as a valid value', () => {
    expect(
      buildToolExecutionMetadata({
        executionTime: 0,
      }),
    ).toEqual({
      'Tool Name': 'Unknown',
      'Execution Time': '0.000s',
      Success: 'No',
      'Active Window': 'Unknown',
    });
  });

  test('treats invalid or negative execution time as unavailable', () => {
    expect(
      buildToolExecutionMetadata({
        executionTime: Number.NaN,
      }),
    ).toEqual({
      'Tool Name': 'Unknown',
      'Execution Time': 'N/A',
      Success: 'No',
      'Active Window': 'Unknown',
    });

    expect(
      buildToolExecutionMetadata({
        executionTime: -1,
      }),
    ).toEqual({
      'Tool Name': 'Unknown',
      'Execution Time': 'N/A',
      Success: 'No',
      'Active Window': 'Unknown',
    });
  });
});
