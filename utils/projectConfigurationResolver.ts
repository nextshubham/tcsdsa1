import type {
  PmExtendedAttribute,
  PmProjectDetails,
  ResolvedProjectConfiguration,
} from '../models/pmClassification';
import logger from './logger';
import { InputParameterParser } from './inputParameterParser';
import { DamFieldMappingParser } from './damFieldMappingParser';
import {
  DamRecordPayloadBuilder,
  type DamRecordPayload,
} from './damRecordPayloadBuilder';
import type { WorkflowContext } from '../models/createDamRecordWorkflow';

type MappingConfiguration = Extract<
  ResolvedProjectConfiguration,
  { format: 'FIELD_MAPPING' }
>['data'];

export class ProjectConfigurationResolver {
  public static resolveConfiguration(
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

  public static getProjectTitle(
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

  public static getDamLanguageId(): string {
    const languageId =
      process.env.APRIMO_DAM_LANGUAGE_ID?.trim();

    if (!languageId) {
      throw new Error(
        'APRIMO_DAM_LANGUAGE_ID is not configured'
      );
    }

    return languageId;
  }

  public static buildPayloads(
    mapping: MappingConfiguration,
    projectDetails: PmProjectDetails,
    context: WorkflowContext
  ): DamRecordPayload[] {
    const { projectId, taskId, environment } = context;

    logger.info({
      msg: 'DAM field mapping values extracted successfully',
      options: {
        projectId,
        taskId,
        environment,
        configurationFormat: 'FIELD_MAPPING',
        damFields: mapping.DamFieldList.items.map((item) => ({
          damContentType: item.damContentType,
          damProjectTitleFieldId: item.damProjectTitleFieldId,
          damClassificationId: item.damClassificationId,
        })),
        pmFields: mapping.PMFieldList.items.map((item) => ({
          pmDigitalAssetTypeId: item.pmDigitalAssetTypeId,
        })),
      },
    });

    const projectTitle = ProjectConfigurationResolver.getProjectTitle(
      projectDetails
    );
    const languageId = ProjectConfigurationResolver.getDamLanguageId();
    const damRecordPayloads = DamRecordPayloadBuilder.buildPayloads(
      mapping,
      projectTitle,
      languageId
    );

    logger.info({
      msg: 'DAM record payloads built successfully',
      options: {
        projectId,
        taskId,
        environment,
        configurationFormat: 'FIELD_MAPPING',
        payloadCount: damRecordPayloads.length,
        contentTypes: damRecordPayloads.map((payload) => payload.contentType),
      },
    });

    if (
      process.env.NODE_ENV === 'development' &&
      process.env.LOG_DAM_RECORD_PAYLOAD === 'true'
    ) {
      logger.info({
        msg: 'DAM record payload preview',
        options: { projectId, taskId, damRecordPayloads },
      });
    }

    return damRecordPayloads;
  }
}
