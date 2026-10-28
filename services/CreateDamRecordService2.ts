
import type {
  PmExtendedAttribute,
  ResolvedProjectConfiguration,
} from '../models/pmClassification';
import logger from '../utils/logger';
import { InputParameterParser } from '../utils/inputParameterParser';
import { DamFieldMappingParser } from '../utils/damFieldMappingParser';
import { PmProjectService } from './pmProjectService';

export class CreateDamRecordService {
  private static resolveConfiguration(
    extendedAttributes: PmExtendedAttribute[],
    inputParameterEaId?: number | string
  ): ResolvedProjectConfiguration {
    const payloadEaId =
      inputParameterEaId === undefined
        ? ''
        : String(inputParameterEaId).trim();

    const envEaId = process.env.INPUT_PARAMETER_EA_ID?.trim() || '';

    const selectedEaId = payloadEaId || envEaId;

    // Respect existing EA ID selection priority.
    if (selectedEaId) {
      const selectedAttribute = extendedAttributes.find(
        (attribute) =>
          String(attribute.eaId).trim() === selectedEaId
      );

      // New field-mapping format
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

      // Existing classification format
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
      // Old parser did not resolve the configuration.
      // Check whether the new format exists.
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

      // Preserve the original parser error.
      throw originalError;
    }
  }

  public static async resolveProjectInputParameters(
    projectId: number,
    taskId: number,
    environment: string,
    inputParameterEaId?: number | string
  ): Promise<ResolvedProjectConfiguration> {
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

      // Step 4: Log resolved configuration format
      logger.info({
        msg: 'PM Project InputParameters resolved successfully',
        options: {
          projectId,
          taskId,
          environment,
          configurationFormat: result.format,
        },
      });

      // Step 5: Log extracted values based on configuration format
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
      } else {
        // Preserve existing classification format processing
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
      }

      // Step 6: Return configuration for future processing
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
