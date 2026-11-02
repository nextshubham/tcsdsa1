import logger from '../utils/logger';
import type { WorkflowContext } from '../models/createDamRecordWorkflow';
import { PmProjectStatusService } from './pmProjectStatusService';
import { PmTaskService } from './pmTaskService';

export class PmProjectWorkflowService {
  public static async markPass(
    context: WorkflowContext,
    logCompletion = true
  ): Promise<void> {
    const { projectId, taskId, environment } = context;
    await PmProjectStatusService.markPass(projectId, environment);
    if (logCompletion) {
      logger.info({
        msg: 'PM Project status update completed successfully',
        options: { projectId, taskId, environment, status: 'Pass' },
      });
    }
  }

  public static async markFail(
    context: WorkflowContext,
    errorMessage: string
  ): Promise<void> {
    await PmProjectStatusService.markFail(
      context.projectId,
      errorMessage,
      context.environment
    );
  }

  public static async closeTask(context: WorkflowContext): Promise<void> {
    const { projectId, taskId, environment } = context;
    logger.info({
      msg: 'Calling PM Task close API',
      options: { projectId, taskId, environment },
    });
    await PmTaskService.closeTask(taskId, environment);
    logger.info({
      msg: 'PM Task close completed successfully',
      options: { projectId, taskId, environment },
    });
  }
}
