import { PmProjectWorkflowService } from '../../services/PmProjectWorkflowService';
import { PmProjectStatusService } from '../../services/pmProjectStatusService';
import { PmTaskService } from '../../services/pmTaskService';
import logger from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../services/pmProjectStatusService', () => ({
  PmProjectStatusService: { markPass: jest.fn(), markFail: jest.fn() },
}));
jest.mock('../../services/pmTaskService', () => ({
  PmTaskService: { closeTask: jest.fn() },
}));

const context = { projectId: 274801, taskId: 2301827, environment: 'development' };
const markPass = PmProjectStatusService.markPass as jest.Mock;
const markFail = PmProjectStatusService.markFail as jest.Mock;
const closeTask = PmTaskService.closeTask as jest.Mock;
const info = logger.info as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  markPass.mockResolvedValue(undefined);
  markFail.mockResolvedValue(undefined);
  closeTask.mockResolvedValue(undefined);
});

describe('PmProjectWorkflowService', () => {
  it('uses the correct project and environment for Pass', async () => {
    await PmProjectWorkflowService.markPass(context);
    expect(markPass).toHaveBeenCalledWith(274801, 'development');
    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'PM Project status update completed successfully',
      options: expect.objectContaining({ status: 'Pass', taskId: 2301827 }),
    }));
  });

  it('supports quiet Pass update in isolated tests', async () => {
    await PmProjectWorkflowService.markPass(context, false);
    expect(markPass).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('passes error details to markFail', async () => {
    await PmProjectWorkflowService.markFail(context, 'Classification denied');
    expect(markFail).toHaveBeenCalledWith(274801, 'Classification denied', 'development');
    expect(markPass).not.toHaveBeenCalled();
  });

  it('closes the exact webhook task ID, not the project ID', async () => {
    await PmProjectWorkflowService.closeTask(context);
    expect(closeTask).toHaveBeenCalledWith(2301827, 'development');
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'PM Task close completed successfully' }));
  });

  it('propagates failures from the underlying task close API', async () => {
    closeTask.mockRejectedValue(new Error('Task already closed'));
    await expect(PmProjectWorkflowService.closeTask(context))
      .rejects.toThrow('Task already closed');
    expect(info).not.toHaveBeenCalledWith(expect.objectContaining({ msg: 'PM Task close completed successfully' }));
  });

  it('propagates project Pass API errors', async () => {
    markPass.mockRejectedValue(new Error('Cannot update CU Status'));
    await expect(PmProjectWorkflowService.markPass(context))
      .rejects.toThrow('Cannot update CU Status');
  });
});
