
import type { InputParameterResolutionResult } from '../models/pmClassification';
import logger from '../utils/logger';
import { InputParameterParser } from '../utils/inputParameterParser';
import { PmProjectService } from './pmProjectService';

export class CreateDamRecordService {
  public static async resolveProjectInputParameters(
    projectId: number,
    taskId: number,
    environment: string
  ): Promise<InputParameterResolutionResult> {
    // Validate project ID
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid projectId');
    }

    // Validate task ID
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      throw new Error('Invalid taskId');
    }

    // Validate environment
    if (!environment?.trim()) {
      throw new Error('Environment is required');
    }

    logger.info({
      msg: 'Starting Create DAM Record project processing',
      options: {
        projectId,
        taskId,
        environment,
      },
    });

    try {
      // Step 1: Get PM project details
      const projectDetails = await PmProjectService.getProjectDetails(
        projectId,
        environment
      );

      logger.info({
        msg: 'PM project details retrieved successfully',
        options: {
          projectId,
          taskId,
          environment,
        },
      });

      // Step 2: Resolve InputParameters
      const inputParametersResult =
        InputParameterParser.resolveInputParameters(
          projectDetails.extendedAttributes
        );

      logger.info({
        msg: 'PM project InputParameters resolved successfully',
        options: {
          projectId,
          taskId,
          environment,
        },
      });

      // Step 3: Return resolved configuration
      return inputParametersResult;
    } catch (error) {
      logger.error({
        msg: 'Create DAM Record project processing failed',
        options: {
          projectId,
          taskId,
          environment,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        },
      });

      throw error;
    }
  }
}
