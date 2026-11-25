import { PmActivityService } from '../../../services/pmActivityService';
import { PmTaskService } from '../../../services/pmTaskService';
import logger from '../../../utils/logger';
import type { FieldConcatReadOnlyPreview } from '../models/FieldConcatReadOnly';
import { FieldConcatActivityIdResolver } from '../utils/FieldConcatActivityIdResolver';
import { FieldConcatenationService } from './FieldConcatenationService';
import { FieldConcatFieldValueService } from './FieldConcatFieldValueService';

export class FieldConcatReadOnlyService {
  public static async preview(
    projectId: number,
    taskId: number,
    environment: string
  ): Promise<FieldConcatReadOnlyPreview> {
    const startedAt = Date.now();
    const logContext = {
      correlationId: String(projectId),
      projectId,
      taskId,
      environment,
      stage: 'FIELD_VALUES_PREVIEW',
    };
    let outcome = 'FAILED';

    logger.info({
      msg: 'FCU read-only field preview started',
      options: logContext,
    });

    try {
      const { config, projectDetails } =
        await FieldConcatenationService.resolveProjectConfiguration(
          projectId, taskId, environment
        );

      const taskDetails = await PmTaskService.getTaskDetails(
        taskId, environment, String(projectId)
      );

      const requiresActivity =
        config.inputConcatFields.some(
          (field) => field.objectType === 'Activity'
        ) ||
        config.output.some((field) => field.objectType === 'Activity');

      let activityId: number | undefined;
      let activityDetails: unknown;
      if (requiresActivity) {
        activityId = FieldConcatActivityIdResolver.resolve(
          projectDetails, taskDetails
        );
        logger.info({
          msg: 'FCU PM activity retrieval started',
          options: { ...logContext, activityId },
        });
        activityDetails = await PmActivityService.getActivityDetails(
          activityId, environment
        );
        logger.info({
          msg: 'FCU PM activity retrieval completed',
          options: { ...logContext, activityId },
        });
      }

      const fields = FieldConcatFieldValueService.previewFields(config, {
        projectId,
        taskId,
        activityId,
        project: projectDetails,
        task: taskDetails,
        activity: activityDetails,
      });
      const statuses: Record<string, number> = {};
      fields.forEach((field) => {
        statuses[field.status] = (statuses[field.status] ?? 0) + 1;
      });

      logger.info({
        msg: 'FCU read-only field extraction completed',
        options: {
          ...logContext,
          activityId,
          fieldCount: fields.length,
          statuses,
        },
      });

      outcome = 'PREVIEW_READY';
      return {
        projectId,
        taskId,
        activityId,
        separator: config.separator,
        inputFieldCount: config.inputConcatFields.length,
        outputFieldCount: config.output.length,
        fields,
        processingCompleted: false,
      };
    } catch (error) {
      logger.error({
        msg: 'FCU read-only field preview failed',
        options: {
          ...logContext,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      logger.info({
        msg: 'FCU read-only field preview ended',
        options: { ...logContext, outcome, durationMs: Date.now() - startedAt },
      });
    }
  }
}
