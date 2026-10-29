
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
import {
  DamRecordService,
  type DamRecordCreationResult,
} from './damRecordService';

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
      createdDamRecords?: DamRecordCreationResult[];
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

    const projectData =
      projectDetails as unknown as Record<string, unknown>;

    const projectTitle = titleKeys
      .map((key) => projectData[key])
      .find(
        (value): value is string =>
          typeof value === 'string' &&
          value.trim().length > 0
      );

    if (!projectTitle) {
      throw new Error(
        'PM project title not found in project details'
      );
    }

    return projectTitle.trim();
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

  // Controlled development testing only.
  // DAM creation remains disabled by default.
  private static isDamCreationEnabledForTest(
    projectId: number
  ): boolean {
    if (
      process.env.ENABLE_DAM_RECORD_CREATION !== 'true'
    ) {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Controlled DAM record creation is only allowed in development'
      );
    }

    const testProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();

    if (
      !testProjectId ||
      testProjectId !== String(projectId)
    ) {
      throw new Error(
        'DAM creation is not enabled for this test project'
      );
    }

    return true;
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

      // Step 4: Process FIELD_MAPPING format
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

        // Step 5: Retrieve PM project title
        const projectTitle =
          CreateDamRecordService.getProjectTitle(
            projectDetails
          );

        // Step 6: Get configured language ID
        const languageId =
          CreateDamRecordService.getDamLanguageId();

        // Step 7: Build DAM record payloads
        const damRecordPayloads =
          DamRecordPayloadBuilder.buildPayloads(
            result.data,
            projectTitle,
            languageId
          );

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

        // Optional development payload preview
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

        // Step 8: Check whether actual DAM creation is enabled
        const creationEnabled =
          CreateDamRecordService.isDamCreationEnabledForTest(
            projectId
          );

        if (!creationEnabled) {
          logger.info({
            msg: 'DAM record creation skipped - dry run',
            options: {
              projectId,
              taskId,
              environment,
              payloadCount: damRecordPayloads.length,
            },
          });

          return {
            ...result,
            damRecordPayloads,
          };
        }

        // Safety check for first controlled integration test.
        if (damRecordPayloads.length !== 1) {
          throw new Error(
            'Controlled DAM creation test requires exactly one payload'
          );
        }

        // Step 9: Call DAM Create Record API
        const createdRecord =
          await DamRecordService.createDamRecord(
            damRecordPayloads[0]
          );

        logger.info({
          msg: 'DAM record creation completed successfully',
          options: {
            projectId,
            taskId,
            environment,
            damRecordId: createdRecord.recordId,
            statusCode: createdRecord.statusCode,
          },
        });

        // Step 10: Return configuration, payload and created record ID
        return {
          ...result,
          damRecordPayloads,
          createdDamRecords: [createdRecord],
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
