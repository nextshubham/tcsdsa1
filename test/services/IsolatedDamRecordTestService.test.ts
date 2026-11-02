import { IsolatedDamRecordTestService } from '../../services/IsolatedDamRecordTestService';
import { DamRecordService } from '../../services/damRecordService';
import { PmDigitalAssetService } from '../../services/pmDigitalAssetService';
import { PmProjectWorkflowService } from '../../services/PmProjectWorkflowService';
import type { IsolatedWorkflowFlags, MappingConfiguration, WorkflowProgress } from '../../models/createDamRecordWorkflow';
import type { DamRecordPayload } from '../../utils/damRecordPayloadBuilder';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../services/damRecordService', () => ({
  DamRecordService: { createDamRecord: jest.fn() },
}));
jest.mock('../../services/pmDigitalAssetService', () => ({
  PmDigitalAssetService: { createDamMapping: jest.fn(), associateAssetWithProject: jest.fn() },
}));
jest.mock('../../services/PmProjectWorkflowService', () => ({
  PmProjectWorkflowService: { markPass: jest.fn(), markFail: jest.fn(), closeTask: jest.fn() },
}));

const context = { projectId: 274801, taskId: 2301827, environment: 'development' };
const mapping = {
  DamFieldList: { items: [{ damContentType: 'MLR Approval Record', damProjectTitleFieldId: 'field', damClassificationId: 'class' }] },
  PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
} as MappingConfiguration;
const payload = { status: 'draft', contentType: 'MLR Approval Record' } as DamRecordPayload;
const baseFlags: IsolatedWorkflowFlags = {
  creationEnabled: false,
  mappingEnabled: false,
  associationEnabled: false,
  statusEnabled: false,
  taskCloseEnabled: false,
};
const createDam = DamRecordService.createDamRecord as jest.Mock;
const createMapping = PmDigitalAssetService.createDamMapping as jest.Mock;
const associate = PmDigitalAssetService.associateAssetWithProject as jest.Mock;
const markPass = PmProjectWorkflowService.markPass as jest.Mock;
const markFail = PmProjectWorkflowService.markFail as jest.Mock;
const closeTask = PmProjectWorkflowService.closeTask as jest.Mock;
const originalEnv = { ...process.env };
let progress: WorkflowProgress;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv };
  progress = { workflowStage: 'PM_PROJECT_GET', failureStatusAttempted: false };
  createDam.mockResolvedValue({ recordId: 'created-id', statusCode: 201 });
  createMapping.mockResolvedValue({ assetId: 357401, versionId: 365301 });
  associate.mockResolvedValue(undefined);
  markPass.mockResolvedValue(undefined);
  markFail.mockResolvedValue(undefined);
});
afterAll(() => { process.env = originalEnv; });

const execute = (flags: IsolatedWorkflowFlags) =>
  IsolatedDamRecordTestService.execute(mapping, [payload], context, flags, progress);

describe('IsolatedDamRecordTestService', () => {
  it('performs no writes for a dry run', async () => {
    expect(await execute(baseFlags)).toEqual({});
    expect(createDam).not.toHaveBeenCalled();
    expect(createMapping).not.toHaveBeenCalled();
    expect(associate).not.toHaveBeenCalled();
    expect(markPass).not.toHaveBeenCalled();
    expect(markFail).not.toHaveBeenCalled();
  });

  it('creates only the DAM record when creation is enabled', async () => {
    expect(await execute({ ...baseFlags, creationEnabled: true }))
      .toEqual({ createdDamRecords: [{ recordId: 'created-id', statusCode: 201 }] });
    expect(createDam).toHaveBeenCalledWith(payload);
    expect(createMapping).not.toHaveBeenCalled();
  });

  it('maps the existing DAM record using the environment record ID', async () => {
    process.env.PM_DAM_MAPPING_TEST_RECORD_ID = ' existing-record-id ';
    expect(await execute({ ...baseFlags, mappingEnabled: true })).toEqual({
      pmDamMappings: [{ damRecordId: 'existing-record-id', assetId: 357401, versionId: 365301 }],
    });
    expect(createMapping).toHaveBeenCalledWith('existing-record-id', '1701');
    expect(createDam).not.toHaveBeenCalled();
  });

  it('rejects mapping when the existing DAM record ID is missing', async () => {
    delete process.env.PM_DAM_MAPPING_TEST_RECORD_ID;
    await expect(execute({ ...baseFlags, mappingEnabled: true }))
      .rejects.toThrow('PM_DAM_MAPPING_TEST_RECORD_ID is not configured');
    expect(createMapping).not.toHaveBeenCalled();
  });

  it('rejects mapping if there is more than one PM asset type', async () => {
    process.env.PM_DAM_MAPPING_TEST_RECORD_ID = 'existing-record';
    const invalidMapping = { ...mapping, PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }, { pmDigitalAssetTypeId: '1702' }] } } as MappingConfiguration;
    await expect(IsolatedDamRecordTestService.execute(invalidMapping, [payload], context, { ...baseFlags, mappingEnabled: true }, progress))
      .rejects.toThrow('exactly one PMFieldList item');
    expect(createMapping).not.toHaveBeenCalled();
  });

  it('associates only the configured existing PM asset', async () => {
    expect(await execute({ ...baseFlags, associationEnabled: true, associationTestAssetId: 357401 }))
      .toEqual({ pmProjectAssociations: [{ projectId: 274801, assetId: 357401 }] });
    expect(associate).toHaveBeenCalledWith(274801, 357401);
    expect(createDam).not.toHaveBeenCalled();
  });

  it('updates project to Pass without creating an asset', async () => {
    expect(await execute({ ...baseFlags, statusEnabled: true, statusTestResult: 'Pass' }))
      .toEqual({ pmProjectStatus: 'Pass' });
    expect(markPass).toHaveBeenCalledWith(context, false);
    expect(markFail).not.toHaveBeenCalled();
  });

  it('uses an explicit Fail message and records the attempted update', async () => {
    const result = await execute({
      ...baseFlags,
      statusEnabled: true,
      statusTestResult: 'Fail',
      statusTestErrorMessage: 'Controlled failure',
    });
    expect(result).toEqual({ pmProjectStatus: 'Fail' });
    expect(markFail).toHaveBeenCalledWith(context, 'Controlled failure');
    expect(progress.failureStatusAttempted).toBe(true);
  });

  it('records the failure attempt even when markFail rejects', async () => {
    markFail.mockRejectedValue(new Error('Aprimo status API failed'));
    await expect(execute({ ...baseFlags, statusEnabled: true, statusTestResult: 'Fail', statusTestErrorMessage: 'Controlled failure' }))
      .rejects.toThrow('Aprimo status API failed');
    expect(progress.failureStatusAttempted).toBe(true);
  });

  it('leaves task closure to the outer finally block', async () => {
    await execute({ ...baseFlags, taskCloseEnabled: true });
    expect(closeTask).not.toHaveBeenCalled();
  });
});
