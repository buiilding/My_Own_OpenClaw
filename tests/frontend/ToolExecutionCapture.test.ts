jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

import {
  captureAfterTool,
  getWaitSeconds,
  isComputerUseTool,
} from '../../frontend/src/renderer/infrastructure/services/ToolExecutionCapture';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;

describe('ToolExecutionCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('isComputerUseTool detects standard tools and run_shell_command wait', () => {
    expect(isComputerUseTool('mouse_control', {})).toBe(true);
    expect(isComputerUseTool('read_file', {})).toBe(false);
    expect(isComputerUseTool('run_shell_command', { wait: 3 })).toBe(true);
    expect(isComputerUseTool('run_shell_command', { wait: 0 })).toBe(false);
  });

  test('getWaitSeconds prefers explicit seconds and args.wait', () => {
    expect(getWaitSeconds('wait', { seconds: 5 }, 2)).toBe(5);
    expect(getWaitSeconds('mouse_control', { wait: 4 }, 2)).toBe(4);
    expect(getWaitSeconds('mouse_control', {}, 2)).toBe(2);
  });

  test('captureAfterTool uses computed wait seconds and returns system state', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App', mouse_position: '1,1' },
      screenshot: 'shot',
    });

    const nowSpy = jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2500);

    const result = await captureAfterTool('wait', { seconds: 3 }, true, 2);

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, true, 3, false);
    expect(result.waitSeconds).toBe(3);
    expect(result.systemState).toEqual({ active_window: 'App', mouse_position: '1,1' });
    expect(result.screenshot).toBe('shot');
    expect(result.captureTime).toBeCloseTo(1.5, 5);

    nowSpy.mockRestore();
  });

  test('captureAfterTool drops system state when disabled', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App' },
      screenshot: 'shot',
    });

    const result = await captureAfterTool('mouse_control', { action: 'click' }, false, 2);

    expect(mockExtractOSstate).toHaveBeenCalledWith(true, false, 2, false);
    expect(result.systemState).toBeNull();
    expect(result.screenshot).toBe('shot');
  });
});
