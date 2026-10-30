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
import { PmDigitalAssetService } from './pmDigitalAssetService';
import { PmProjectStatusService } from './pmProjectStatusService';

export interface PmDamMappingResult {
  damRecordId: string;
  assetId: number;
  versionId: number;
}

export interface PmProjectAssociationResult {
  projectId: number;
  assetId: number;
}

export type PmProjectStatusResult = 'Pass' | 'Fail';

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
      pmDamMappings?: PmDamMappingResult[];
      pmProjectAssociations?: PmProjectAssociationResult[];
      pmProjectStatus?: PmProjectStatusResult;
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

  // The existing DAM record is mapped only in a controlled local test.
  private static isPmMappingEnabledForTest(
    projectId: number
  ): boolean {
    if (process.env.ENABLE_PM_DAM_MAPPING !== 'true') {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Controlled PM DAM mapping is only allowed in development'
      );
    }

    const testProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();

    if (!testProjectId || testProjectId !== String(projectId)) {
      throw new Error(
        'PM DAM mapping is not enabled for this test project'
      );
    }

    return true;
  }

  // Association-only test: reuse the PM asset already verified by GET.
  private static isPmProjectAssociationEnabledForTest(
    projectId: number
  ): boolean {
    if (process.env.ENABLE_PM_PROJECT_ASSOCIATION !== 'true') {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Controlled PM Project association is only allowed in development'
      );
    }

    const testProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();

    if (!testProjectId || testProjectId !== String(projectId)) {
      throw new Error(
        'PM Project association is not enabled for this test project'
      );
    }

    return true;
  }

  private static getPmProjectAssociationTestAssetId(): number {
    const configuredAssetId =
      process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID?.trim();

    if (!configuredAssetId || !/^\d+$/.test(configuredAssetId)) {
      throw new Error(
        'PM_PROJECT_ASSOCIATION_TEST_ASSET_ID must be a positive integer'
      );
    }

    const assetId = Number(configuredAssetId);

    if (!Number.isSafeInteger(assetId) || assetId <= 0) {
      throw new Error(
        'PM_PROJECT_ASSOCIATION_TEST_ASSET_ID must be a positive integer'
      );
    }

    return assetId;
  }

  // Step 9: test PM Project status separately from all prior write operations.
  private static isPmProjectStatusEnabledForTest(
    projectId: number
  ): boolean {
    if (process.env.ENABLE_PM_PROJECT_STATUS_UPDATE !== 'true') {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Controlled PM Project status update is only allowed in development'
      );
    }

    const testProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();

    if (!testProjectId || testProjectId !== String(projectId)) {
      throw new Error(
        'PM Project status update is not enabled for this test project'
      );
    }

    return true;
  }

  // An explicit Pass/Fail choice prevents accidentally marking a project.
  private static getPmProjectStatusTestResult(): PmProjectStatusResult {
    const status = process.env.PM_PROJECT_STATUS_TEST_RESULT?.trim();

    if (status !== 'Pass' && status !== 'Fail') {
      throw new Error(
        'PM_PROJECT_STATUS_TEST_RESULT must be Pass or Fail'
      );
    }

    return status;
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
      const {extendedAttributes} = projectDetails;

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

        // Step 8: Resolve controlled test flags before any write.
        const creationEnabled =
          CreateDamRecordService.isDamCreationEnabledForTest(
            projectId
          );

        const mappingEnabled =
          CreateDamRecordService.isPmMappingEnabledForTest(
            projectId
          );

        const associationEnabled =
          CreateDamRecordService.isPmProjectAssociationEnabledForTest(
            projectId
          );

        const statusEnabled =
          CreateDamRecordService.isPmProjectStatusEnabledForTest(
            projectId
          );

        logger.info({
          msg: 'PM Project association configuration check',
          options: {
            nodeEnv: process.env.NODE_ENV,
            associationFlag: process.env.ENABLE_PM_PROJECT_ASSOCIATION,
            associationEnabled,
            projectId,
            configuredTestProjectId: process.env.DAM_CREATE_TEST_PROJECT_ID,
            configuredAssetId: process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID,
          },
        });

        // Step 8 mapping test reuses an existing DAM record; it must
        // not create another DAM record in the same webhook request.
        if (creationEnabled && mappingEnabled) {
          throw new Error(
            'Disable DAM creation when testing PM DAM mapping'
          );
        }

        // Keep each controlled test independent; never issue multiple
        // kinds of write request in one webhook invocation.
        if (associationEnabled && (creationEnabled || mappingEnabled)) {
          throw new Error(
            'Disable DAM creation and PM DAM mapping when testing project association'
          );
        }

        // Never combine a status-only test with a previous write step.
        if (
          statusEnabled &&
          (creationEnabled || mappingEnabled || associationEnabled)
        ) {
          throw new Error(
            'Disable DAM creation, PM mapping and association when testing PM Project status'
          );
        }

        // Choose the status explicitly; a Fail test also needs a reason.
        const statusTestResult = statusEnabled
          ? CreateDamRecordService.getPmProjectStatusTestResult()
          : undefined;

        const statusTestErrorMessage =
          statusTestResult === 'Fail'
            ? process.env.PM_PROJECT_STATUS_TEST_ERROR_MESSAGE?.trim()
            : undefined;

        if (statusTestResult === 'Fail' && !statusTestErrorMessage) {
          throw new Error(
            'PM_PROJECT_STATUS_TEST_ERROR_MESSAGE is required for a Fail test'
          );
        }

        logger.info({
          msg: 'PM Project status configuration check',
          options: { projectId, statusEnabled, statusTestResult },
        });

        // Validate the association test ID before any write operation.
        const associationTestAssetId = associationEnabled
          ? CreateDamRecordService.getPmProjectAssociationTestAssetId()
          : undefined;

        // Ensure the first controlled write can operate on only one
        // DAM payload; do not silently ignore additional entries.
        if (
          (
            creationEnabled ||
            mappingEnabled ||
            associationEnabled ||
            statusEnabled
          ) &&
          damRecordPayloads.length !== 1
        ) {
          throw new Error(
            'Controlled integration test requires exactly one DAM payload'
          );
        }

        let createdDamRecords: DamRecordCreationResult[] | undefined;
        let pmDamMappings: PmDamMappingResult[] | undefined;
        let pmProjectAssociations: PmProjectAssociationResult[] | undefined;
        let pmProjectStatus: PmProjectStatusResult | undefined;

        if (creationEnabled) {
          // Step 7: Create one DAM record (existing functionality).
          const createdRecord =
            await DamRecordService.createDamRecord(
              damRecordPayloads[0]
            );

          createdDamRecords = [createdRecord];

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
        } else {
          logger.info({
            msg: 'DAM record creation skipped - dry run',
            options: {
              projectId,
              taskId,
              environment,
              payloadCount: damRecordPayloads.length,
            },
          });
        }

        if (mappingEnabled) {
          // For the first mapping test, use the DAM record created
          // and verified during Step 7, not a newly created record.
          const damRecordId =
            process.env.PM_DAM_MAPPING_TEST_RECORD_ID?.trim();

          if (!damRecordId) {
            throw new Error(
              'PM_DAM_MAPPING_TEST_RECORD_ID is not configured'
            );
          }

          const pmFields = result.data.PMFieldList.items;

          if (pmFields.length !== 1) {
            throw new Error(
              'Controlled PM DAM mapping requires exactly one PMFieldList item'
            );
          }

          // Step 8: Create the PM mapping for the existing DAM record.
          const mappingResult =
            await PmDigitalAssetService.createDamMapping(
              damRecordId,
              pmFields[0].pmDigitalAssetTypeId
            );

          pmDamMappings = [
            {
              damRecordId,
              assetId: mappingResult.assetId,
              versionId: mappingResult.versionId,
            },
          ];

          logger.info({
            msg: 'PM DAM mapping completed successfully',
            options: {
              projectId,
              taskId,
              environment,
              damRecordId,
              assetId: mappingResult.assetId,
              versionId: mappingResult.versionId,
            },
          });
        } else {
          logger.info({
            msg: 'PM DAM mapping skipped - disabled',
            options: { projectId, taskId, environment },
          });
        }

        if (associationEnabled && associationTestAssetId !== undefined) {
          // Step 8: Associate the already mapped PM asset with the PM project.
          // This does not create a new DAM record or repeat the mapping POST.
          await PmDigitalAssetService.associateAssetWithProject(
            projectId,
            associationTestAssetId
          );

          pmProjectAssociations = [
            {
              projectId,
              assetId: associationTestAssetId,
            },
          ];

          logger.info({
            msg: 'PM Project association completed successfully',
            options: {
              projectId,
              taskId,
              environment,
              assetId: associationTestAssetId,
            },
          });
        } else {
          logger.info({
            msg: 'PM Project association skipped - disabled',
            options: { projectId, taskId, environment },
          });
        }

        // Step 9: isolated, explicit status test. This does not yet infer
        // automatic Pass/Fail from the full workflow's outcome.
        if (statusEnabled && statusTestResult === 'Pass') {
          await PmProjectStatusService.markPass(projectId, environment);
          pmProjectStatus = 'Pass';
        } else if (
          statusEnabled &&
          statusTestResult === 'Fail' &&
          statusTestErrorMessage
        ) {
          await PmProjectStatusService.markFail(
            projectId,
            statusTestErrorMessage,
            environment
          );
          pmProjectStatus = 'Fail';
        }

        logger.info({
          msg: pmProjectStatus
            ? 'PM Project status update completed successfully'
            : 'PM Project status update skipped - disabled',
          options: {
            projectId,
            taskId,
            environment,
            status: pmProjectStatus,
          },
        });

        // Preserve the existing result and add write results only
        // when those writes were explicitly enabled.
        return {
          ...result,
          damRecordPayloads,
          ...(createdDamRecords ? { createdDamRecords } : {}),
          ...(pmDamMappings ? { pmDamMappings } : {}),
          ...(pmProjectAssociations ? { pmProjectAssociations } : {}),
          ...(pmProjectStatus ? { pmProjectStatus } : {}),
        };
      }

      if (process.env.ENABLE_PM_PROJECT_STATUS_UPDATE === 'true') {
        // The status-only test currently targets the new FIELD_MAPPING flow.
        CreateDamRecordService.isPmProjectStatusEnabledForTest(projectId);
        throw new Error(
          'PM Project status test requires FIELD_MAPPING configuration'
        );
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
