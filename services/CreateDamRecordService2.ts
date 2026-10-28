
import type {
  PmExtendedAttribute,
  PmProjectDetails,
  ResolvedProjectConfiguration,
} from '../models/pmClassification';
import logger from '../utils/logger';
import { InputParameterParser } from '../utils/inputParameterParser';
import { DamFieldMappingParser } from '../utils/damFieldMappingParser';
import {
  DamRecordPayloadBuilder,
  type DamRecordPayload,
} from '../utils/damRecordPayloadBuilder';
import { PmProjectService } from './pmProjectService';

export type CreateDamRecordResolutionResult =
  | Extract<
      ResolvedProjectConfiguration,
      { format: 'CLASSIFICATION' }
    >
  | (Extract<
      ResolvedProjectConfiguration,
      { format: 'FIELD_MAPPING' }
    > & {
      damRecordPayloads: DamRecordPayload[];
    });

export class CreateDamRecordService {
  private static resolveConfiguration(
    extendedAttributes: PmExtendedAttribute[],
    inputParameterEaId?: number | string
  ): ResolvedProjectConfiguration {
    const payloadEaId =
      inputParameterEaId === undefined
        ? ''
        : String(inputParameterEaId).trim();

    const envEaId =
      process.env.INPUT_PARAMETER_EA_ID?.trim() || '';

    const selectedEaId = payloadEaId || envEaId;

    // Preserve existing EA ID selection priority.
    if (selectedEaId) {
      const selectedAttribute = extendedAttributes.find(
        (attribute) =>
          String(attribute.eaId).trim() === selectedEaId
      );

      if (
        selectedAttribute &&
        DamFieldMappingParser.canParse(selectedAttribute.eaValue)
      ) {
        return {
          format: 'FIELD_MAPPING',
          data: DamFieldMappingParser.parse(
            selectedAttribute.eaValue
          ),
        };
      }

      return {
        format: 'CLASSIFICATION',
        data: InputParameterParser.resolveInputParameters(
          extendedAttributes,
          inputParameterEaId
        ),
      };
    }

    // Preserve old auto-detection behavior first.
    try {
      return {
        format: 'CLASSIFICATION',
        data: InputParameterParser.resolveInputParameters(
          extendedAttributes
        ),
      };
    } catch (originalError) {
      const mappingAttributes = extendedAttributes.filter(
        (attribute) =>
          DamFieldMappingParser.canParse(attribute.eaValue)
      );

      if (mappingAttributes.length > 1) {
        throw new Error(
          'Multiple field mapping configurations found. Configure INPUT_PARAMETER_EA_ID'
        );
      }

      if (mappingAttributes.length === 1) {
        return {
          format: 'FIELD_MAPPING',
          data: DamFieldMappingParser.parse(
            mappingAttributes[0].eaValue
          ),
        };
      }

      throw originalError;
    }
  }

  private static getProjectTitle(
    projectDetails: PmProjectDetails
  ): string {
    const titleKeys = [
      'projectTitle',
      'projectName',
      'name',
      'title',
    ];

    for (const key of titleKeys) {
      const value = projectDetails[key];

      if (
        typeof value === 'string' &&
        value.trim().length > 0
      ) {
        return value.trim();
      }
    }

    throw new Error(
      'PM project title not found in project details'
    );
  }

  private static getDamLanguageId(): string {
    const languageId =
      process.env.APRIMO_DAM_LANGUAGE_ID?.trim();

    if (!languageId) {
      throw new Error(
        'APRIMO_DAM_LANGUAGE_ID is not configured'
      );
    }

    return languageId;
  }

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

    logger.info({
      msg: 'Starting Create DAM Record project processing',
      options: {
        projectId,
        taskId,
        environment,
      },
    });

    try {
      // Step 1: Fetch PM project details
      const projectDetails =
        await PmProjectService.getProjectDetails(
          projectId,
          environment
        );

      // Step 2: Validate extended attributes
      const extendedAttributes =
        projectDetails.extendedAttributes;

      if (!extendedAttributes?.length) {
        throw new Error(
          'Project extendedAttributes are required'
        );
      }

      // Step 3: Resolve old or new configuration
      const result =
        CreateDamRecordService.resolveConfiguration(
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

      // Step 4: Process new FIELD_MAPPING format
      if (result.format === 'FIELD_MAPPING') {
        logger.info({
          msg: 'DAM field mapping values extracted successfully',
          options: {
            projectId,
            taskId,
            environment,
            configurationFormat: result.format,
            damFields: result.data.DamFieldList.items.map(
              (item) => ({
                damContentType: item.damContentType,
                damProjectTitleFieldId:
                  item.damProjectTitleFieldId,
                damClassificationId:
                  item.damClassificationId,
              })
            ),
            pmFields: result.data.PMFieldList.items.map(
              (item) => ({
                pmDigitalAssetTypeId:
                  item.pmDigitalAssetTypeId,
              })
            ),
          },
        });

        // Step 5: Get PM project title
        const projectTitle =
          CreateDamRecordService.getProjectTitle(
            projectDetails
          );

        // Step 6: Read configured DAM language ID
        const languageId =
          CreateDamRecordService.getDamLanguageId();

        // Step 7: Build DAM record payloads
        const damRecordPayloads =
          DamRecordPayloadBuilder.buildPayloads(
            result.data,
            projectTitle,
            languageId
          );

        // Step 8: Log successful payload construction
        logger.info({
          msg: 'DAM record payloads built successfully',
          options: {
            projectId,
            taskId,
            environment,
            configurationFormat: result.format,
            payloadCount: damRecordPayloads.length,
            contentTypes: damRecordPayloads.map(
              (payload) => payload.contentType
            ),
          },
        });

        // Optional local development payload preview
        if (
          process.env.NODE_ENV === 'development' &&
          process.env.LOG_DAM_RECORD_PAYLOAD === 'true'
        ) {
          logger.info({
            msg: 'DAM record payload preview',
            options: {
              projectId,
              taskId,
              damRecordPayloads,
            },
          });
        }

        // No DAM API call in Step 6
        return {
          ...result,
          damRecordPayloads,
        };
      }

      // Preserve existing CLASSIFICATION behavior
      logger.info({
        msg: 'PM Project classification parameters resolved successfully',
        options: {
          projectId,
          taskId,
          environment,
          configurationFormat: result.format,
          inputParameterEaId:
            result.data.inputParameterEaId,
          inputParameterCount:
            result.data.inputParameters.length,
          resolvedBy: result.data.resolvedBy,
        },
      });

      return result;
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
