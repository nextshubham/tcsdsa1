import type {
  CreateDamRecordResolutionResult,
  WorkflowContext,
  WorkflowProgress,
} from '../models/createDamRecordWorkflow';
import logger from '../utils/logger';
import { ProjectConfigurationResolver } from '../utils/projectConfigurationResolver';
import { WorkflowTestConfig } from '../utils/workflowTestConfig';
import { PmProjectService } from './pmProjectService';
import { DamRecordWorkflowService } from './DamRecordWorkflowService';
import { IsolatedDamRecordTestService } from './IsolatedDamRecordTestService';
import { PmProjectWorkflowService } from './PmProjectWorkflowService';

// Keep existing type imports working for controller/tests/consumers.
export type {
  CreateDamRecordResolutionResult,
  PmDamMappingResult,
  PmProjectAssociationResult,
  PmProjectStatusResult,
} from '../models/createDamRecordWorkflow';

/** Same public entry point as before; orchestration delegates to focused classes. */
export class CreateDamRecordService {
  public static async resolveProjectInputParameters(
    projectId: number,
    taskId: number,
    environment: string,
    inputParameterEaId?: number | string
  ): Promise<CreateDamRecordResolutionResult> {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid projectId');
    }
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid taskId');
    }
    if (!environment?.trim()) {
      throw new Error('Environment is required');
    }

    const context: WorkflowContext = { projectId, taskId, environment };
    // Configuration checks happen before finally so an invalid task is
    // never closed as a side effect of a misconfigured test request.
    const initialFlags = WorkflowTestConfig.resolveInitial(context);
    const { fullFlowEnabled, taskCloseEnabled, statusEnabled } = initialFlags;
    const progress: WorkflowProgress = {
      workflowStage: 'PM_PROJECT_GET',
      failureStatusAttempted: false,
    };

    let processingError: Error | undefined;
    let closeErrorResult: Error | undefined;
    let response: CreateDamRecordResolutionResult | undefined;

    logger.info({
      msg: 'Starting Create DAM Record project processing',
      options: { projectId, taskId, environment },
    });

    try {
      const projectDetails = await PmProjectService.getProjectDetails(
        projectId,
        environment
      );
      const { extendedAttributes } = projectDetails;
      if (!extendedAttributes?.length) {
        throw new Error('Project extendedAttributes are required');
      }

      const result = ProjectConfigurationResolver.resolveConfiguration(
        extendedAttributes,
        inputParameterEaId
      );
      logger.info({
        msg: 'PM Project InputParameters resolved successfully',
        options: {
          projectId,
          taskId,
          environment,
          configurationFormat: result.format,
        },
      });

      if (result.format === 'FIELD_MAPPING') {
        const damRecordPayloads = ProjectConfigurationResolver.buildPayloads(
          result.data,
          projectDetails,
          context
        );

        const writeResults = fullFlowEnabled
          ? await DamRecordWorkflowService.execute(
              result.data,
              damRecordPayloads,
              context,
              progress
            )
          : await IsolatedDamRecordTestService.execute(
              result.data,
              damRecordPayloads,
              context,
              WorkflowTestConfig.resolveIsolated(
                context,
                initialFlags,
                damRecordPayloads
              ),
              progress
            );

        response = { ...result, damRecordPayloads, ...writeResults };
      } else {
        if (fullFlowEnabled) {
          throw new Error(
            'Create DAM Record full flow requires FIELD_MAPPING configuration'
          );
        }
        if (process.env.ENABLE_PM_TASK_CLOSE === 'true') {
          throw new Error('PM Task close test requires FIELD_MAPPING configuration');
        }
        if (process.env.ENABLE_PM_PROJECT_STATUS_UPDATE === 'true') {
          throw new Error('PM Project status test requires FIELD_MAPPING configuration');
        }

        logger.info({
          msg: 'PM Project classification parameters resolved successfully',
          options: {
            projectId,
            taskId,
            environment,
            configurationFormat: result.format,
            inputParameterEaId: result.data.inputParameterEaId,
            inputParameterCount: result.data.inputParameters.length,
            resolvedBy: result.data.resolvedBy,
          },
        });
        response = result;
      }
    } catch (error) {
      processingError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = processingError.message;
      logger.error({
        msg: 'Create DAM Record project processing failed',
        options: {
          projectId,
          taskId,
          environment,
          error: errorMessage,
          ...(fullFlowEnabled ? { workflowStage: progress.workflowStage } : {}),
        },
      });

      if (statusEnabled && !progress.failureStatusAttempted) {
        try {
          progress.failureStatusAttempted = true;
          await PmProjectWorkflowService.markFail(context, errorMessage);
        } catch (statusError) {
          logger.error({
            msg: 'Failed to set PM Project status to Fail',
            options: {
              projectId,
              taskId,
              environment,
              error: statusError instanceof Error
                ? statusError.message
                : 'Unknown error',
            },
          });
        }
      }
    } finally {
      if (taskCloseEnabled) {
        try {
          await PmProjectWorkflowService.closeTask(context);
          if (response && response.format === 'FIELD_MAPPING') {
            response.closedPmTaskId = taskId;
          }
        } catch (closeError) {
          logger.error({
            msg: 'PM Task close failed',
            options: {
              projectId,
              taskId,
              environment,
              error: closeError instanceof Error
                ? closeError.message
                : 'Unknown error',
            },
          });
          closeErrorResult = closeError instanceof Error
            ? closeError
            : new Error(String(closeError));
        }
      }
    }

    if (processingError) {
      throw processingError;
    }
    if (closeErrorResult) {
      throw closeErrorResult;
    }
    if (!response) {
      throw new Error('PM Project processing did not return a result');
    }
    return response;
  }
}
