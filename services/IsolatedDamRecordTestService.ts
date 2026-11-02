import type { DamRecordPayload } from '../utils/damRecordPayloadBuilder';
import logger from '../utils/logger';
import type {
  IsolatedWorkflowFlags,
  MappingConfiguration,
  WorkflowContext,
  WorkflowProgress,
  WorkflowWriteResults,
} from '../models/createDamRecordWorkflow';
import { DamRecordService } from './damRecordService';
import { PmDigitalAssetService } from './pmDigitalAssetService';
import { PmProjectWorkflowService } from './PmProjectWorkflowService';

/** Preserves the original individually enabled, development-only write tests. */
export class IsolatedDamRecordTestService {
  public static async execute(
    mapping: MappingConfiguration,
    damRecordPayloads: DamRecordPayload[],
    context: WorkflowContext,
    flags: IsolatedWorkflowFlags,
    progress: WorkflowProgress
  ): Promise<WorkflowWriteResults> {
    const { projectId, taskId, environment } = context;
    const {
      creationEnabled,
      mappingEnabled,
      associationEnabled,
      associationTestAssetId,
      statusEnabled,
      statusTestResult,
      statusTestErrorMessage,
      taskCloseEnabled,
    } = flags;

    const response: WorkflowWriteResults = {};

    if (creationEnabled) {
      const createdRecord = await DamRecordService.createDamRecord(
        damRecordPayloads[0]
      );
      response.createdDamRecords = [createdRecord];
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
        options: { projectId, taskId, environment, payloadCount: damRecordPayloads.length },
      });
    }

    if (mappingEnabled) {
      const damRecordId = process.env.PM_DAM_MAPPING_TEST_RECORD_ID?.trim();
      if (!damRecordId) {
        throw new Error('PM_DAM_MAPPING_TEST_RECORD_ID is not configured');
      }

      const pmFields = mapping.PMFieldList.items;
      if (pmFields.length !== 1) {
        throw new Error(
          'Controlled PM DAM mapping requires exactly one PMFieldList item'
        );
      }

      const mappingResult = await PmDigitalAssetService.createDamMapping(
        damRecordId,
        pmFields[0].pmDigitalAssetTypeId
      );
      response.pmDamMappings = [{
        damRecordId,
        assetId: mappingResult.assetId,
        versionId: mappingResult.versionId,
      }];
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
      await PmDigitalAssetService.associateAssetWithProject(
        projectId,
        associationTestAssetId
      );
      response.pmProjectAssociations = [{
        projectId,
        assetId: associationTestAssetId,
      }];
      logger.info({
        msg: 'PM Project association completed successfully',
        options: { projectId, taskId, environment, assetId: associationTestAssetId },
      });
    } else {
      logger.info({
        msg: 'PM Project association skipped - disabled',
        options: { projectId, taskId, environment },
      });
    }

    // A chosen Fail test is deliberately different from an automatic failure.
    if (statusEnabled && statusTestResult === 'Pass') {
      await PmProjectWorkflowService.markPass(context, false);
      response.pmProjectStatus = 'Pass';
    } else if (
      statusEnabled &&
      statusTestResult === 'Fail' &&
      statusTestErrorMessage
    ) {
      // A failed markFail must not be retried by the outer catch block.
      Object.assign(progress, { failureStatusAttempted: true });
      await PmProjectWorkflowService.markFail(context, statusTestErrorMessage);
      response.pmProjectStatus = 'Fail';
    }

    logger.info({
      msg: response.pmProjectStatus
        ? 'PM Project status update completed successfully'
        : 'PM Project status update skipped - disabled',
      options: { projectId, taskId, environment, status: response.pmProjectStatus },
    });

    if (!taskCloseEnabled) {
      logger.info({
        msg: 'PM Task close skipped - disabled',
        options: { projectId, taskId, environment },
      });
    }

    return response;
  }
}
