import type { DamRecordPayload } from '../utils/damRecordPayloadBuilder';
import logger from '../utils/logger';
import type {
  MappingConfiguration,
  WorkflowContext,
  WorkflowProgress,
  WorkflowWriteResults,
} from '../models/createDamRecordWorkflow';
import { DamRecordService } from './damRecordService';
import { PmDigitalAssetService } from './pmDigitalAssetService';
import { PmProjectWorkflowService } from './PmProjectWorkflowService';

/** Runs all production API operations in order for an approved development full-flow test. */
export class DamRecordWorkflowService {
  public static async execute(
    mapping: MappingConfiguration,
    damRecordPayloads: DamRecordPayload[],
    context: WorkflowContext,
    progress: WorkflowProgress
  ): Promise<WorkflowWriteResults> {
    const { projectId, taskId, environment } = context;
    const pmFields = mapping.PMFieldList.items;

    // Check counts before performing the first external write.
    if (damRecordPayloads.length !== 1 || pmFields.length !== 1) {
      throw new Error(
        'Full flow requires exactly one DAM payload and one PMFieldList item'
      );
    }

    Object.assign(progress, { workflowStage: 'DAM_RECORD_CREATE' });
    logger.info({
      msg: 'Starting full flow DAM record creation',
      options: { projectId, taskId, environment },
    });
    const createdRecord = await DamRecordService.createDamRecord(
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

    Object.assign(progress, { workflowStage: 'PM_DAM_MAPPING' });
    logger.info({
      msg: 'Starting full flow PM DAM mapping',
      options: { projectId, taskId, environment, damRecordId: createdRecord.recordId },
    });
    const mappingResult = await PmDigitalAssetService.createDamMapping(
      createdRecord.recordId,
      pmFields[0].pmDigitalAssetTypeId
    );
    logger.info({
      msg: 'PM DAM mapping completed successfully',
      options: {
        projectId,
        taskId,
        environment,
        damRecordId: createdRecord.recordId,
        assetId: mappingResult.assetId,
        versionId: mappingResult.versionId,
      },
    });

    Object.assign(progress, { workflowStage: 'PM_PROJECT_ASSOCIATION' });
    logger.info({
      msg: 'Starting full flow PM Project association',
      options: { projectId, taskId, environment, assetId: mappingResult.assetId },
    });
    await PmDigitalAssetService.associateAssetWithProject(
      projectId,
      mappingResult.assetId
    );
    logger.info({
      msg: 'PM Project association completed successfully',
      options: { projectId, taskId, environment, assetId: mappingResult.assetId },
    });

    Object.assign(progress, { workflowStage: 'PM_PROJECT_STATUS_PASS' });
    await PmProjectWorkflowService.markPass(context);

    return {
      createdDamRecords: [createdRecord],
      pmDamMappings: [{
        damRecordId: createdRecord.recordId,
        assetId: mappingResult.assetId,
        versionId: mappingResult.versionId,
      }],
      pmProjectAssociations: [{ projectId, assetId: mappingResult.assetId }],
      pmProjectStatus: 'Pass',
    };
  }
}
