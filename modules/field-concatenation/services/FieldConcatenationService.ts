import type { PmProjectDetails } from '../../../models/pmClassification';
import { PmProjectService } from '../../../services/pmProjectService';
import logger from '../../../utils/logger';
import { FieldConcatConfigParser } from '../parsers/FieldConcatConfigParser';
import type { FieldConcatInfo } from '../models/FieldConcatInfo';

export interface FieldConcatProjectConfiguration {
  projectId: number;
  taskId: number;
  extendedAttributeCount: number;
  projectDetails: PmProjectDetails;
  config: FieldConcatInfo;
}

export class FieldConcatenationService {
  public static async resolveProjectConfiguration(
    projectId: number,
    taskId: number,
    environment: string
  ): Promise<FieldConcatProjectConfiguration> {
    const startedAt = Date.now();
    const context = {
      correlationId: String(projectId),
      projectId,
      taskId,
      environment,
      stage: 'PROJECT_CONFIGURATION',
    };
    let outcome = 'FAILED';

    logger.info({
      msg: 'FCU project configuration resolution started',
      options: context,
    });

    try {
      const inputEaId: string =
        process.env.INPUT_PARAMETER_EA_ID?.trim() || '';
      const outputEaId: string =
        process.env.OUTPUT_PARAMETER_EA_ID?.trim() || '';

      if (!inputEaId) {
        throw new Error('INPUT_PARAMETER_EA_ID is not configured');
      }

      if (!outputEaId) {
        throw new Error('OUTPUT_PARAMETER_EA_ID is not configured');
      }

      logger.info({
        msg: 'FCU configuration EA IDs resolved',
        options: { ...context, inputEaId, outputEaId },
      });

      logger.info({
        msg: 'FCU PM project retrieval started',
        options: context,
      });

      const projectDetails = await PmProjectService.getProjectDetails(
        projectId,
        environment
      );
      const { extendedAttributes } = projectDetails;

      if (!Array.isArray(extendedAttributes)) {
        throw new Error('PM project extendedAttributes are unavailable');
      }

      logger.info({
        msg: 'FCU PM project retrieval completed',
        options: { ...context, extendedAttributeCount: extendedAttributes.length },
      });

      const config = FieldConcatConfigParser.resolve(
        extendedAttributes,
        inputEaId,
        outputEaId
      );

      logger.info({
        msg: 'FCU input/output configuration parsed successfully',
        options: {
          ...context,
          inputFieldCount: config.inputConcatFields.length,
          outputFieldCount: config.output.length,
          separatorLength: config.separator.length,
        },
      });

      outcome = 'RESOLVED';
      return {
        projectId,
        taskId,
        extendedAttributeCount: extendedAttributes.length,
        projectDetails,
        config,
      };
    } catch (error) {
      logger.error({
        msg: 'FCU project configuration resolution failed',
        options: {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      logger.info({
        msg: 'FCU project configuration resolution ended',
        options: {
          ...context,
          outcome,
          durationMs: Date.now() - startedAt,
        },
      });
    }
  }
}
