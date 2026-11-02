import { DamRecordWorkflowService } from '../../services/DamRecordWorkflowService';
import { DamRecordService } from '../../services/damRecordService';
import { PmDigitalAssetService } from '../../services/pmDigitalAssetService';
import { PmProjectWorkflowService } from '../../services/PmProjectWorkflowService';
import type { MappingConfiguration, WorkflowProgress } from '../../models/createDamRecordWorkflow';
import type { DamRecordPayload } from '../../utils/damRecordPayloadBuilder';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../services/damRecordService', () => ({
  DamRecordService: { createDamRecord: jest.fn() },
}));
jest.mock('../../services/pmDigitalAssetService', () => ({
  PmDigitalAssetService: {
    createDamMapping: jest.fn(),
    associateAssetWithProject: jest.fn(),
  },
}));
jest.mock('../../services/PmProjectWorkflowService', () => ({
  PmProjectWorkflowService: { markPass: jest.fn(), markFail: jest.fn(), closeTask: jest.fn() },
}));

const context = { projectId: 274801, taskId: 2301827, environment: 'development' };
const mapping = {
  DamFieldList: { items: [{ damContentType: 'MLR Approval Record', damProjectTitleFieldId: 'field-id', damClassificationId: 'class-id' }] },
  PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
} as MappingConfiguration;
const payload = { status: 'draft', contentType: 'MLR Approval Record' } as DamRecordPayload;
const createDam = DamRecordService.createDamRecord as jest.Mock;
const createMapping = PmDigitalAssetService.createDamMapping as jest.Mock;
const associate = PmDigitalAssetService.associateAssetWithProject as jest.Mock;
const markPass = PmProjectWorkflowService.markPass as jest.Mock;
let progress: WorkflowProgress;

beforeEach(() => {
  jest.resetAllMocks();
  progress = { workflowStage: 'PM_PROJECT_GET', failureStatusAttempted: false };
  createDam.mockResolvedValue({ recordId: 'new-record-id', statusCode: 201 });
  createMapping.mockResolvedValue({ assetId: 357401, versionId: 365301 });
  associate.mockResolvedValue(undefined);
  markPass.mockResolvedValue(undefined);
});

describe('DamRecordWorkflowService (full flow)', () => {
  it('creates, maps, associates, marks Pass in order and returns linked IDs', async () => {
    const calls: string[] = [];
    createDam.mockImplementation(async () => { calls.push('create'); return { recordId: 'new-record-id', statusCode: 201 }; });
    createMapping.mockImplementation(async () => { calls.push('mapping'); return { assetId: 357401, versionId: 365301 }; });
    associate.mockImplementation(async () => { calls.push('associate'); });
    markPass.mockImplementation(async () => { calls.push('pass'); });
    const result = await DamRecordWorkflowService.execute(mapping, [payload], context, progress);
    expect(calls).toEqual(['create', 'mapping', 'associate', 'pass']);
    expect(createDam).toHaveBeenCalledWith(payload);
    expect(createMapping).toHaveBeenCalledWith('new-record-id', '1701');
    expect(associate).toHaveBeenCalledWith(274801, 357401);
    expect(markPass).toHaveBeenCalledWith(context);
    expect(progress.workflowStage).toBe('PM_PROJECT_STATUS_PASS');
    expect(result).toEqual({
      createdDamRecords: [{ recordId: 'new-record-id', statusCode: 201 }],
      pmDamMappings: [{ damRecordId: 'new-record-id', assetId: 357401, versionId: 365301 }],
      pmProjectAssociations: [{ projectId: 274801, assetId: 357401 }],
      pmProjectStatus: 'Pass',
    });
  });

  it('refuses multiple DAM payloads before any API write', async () => {
    await expect(DamRecordWorkflowService.execute(mapping, [payload, payload], context, progress))
      .rejects.toThrow('exactly one DAM payload');
    expect(createDam).not.toHaveBeenCalled();
  });

  it('refuses multiple PM digital asset types before any API write', async () => {
    const invalidMapping = {
      ...mapping,
      PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }, { pmDigitalAssetTypeId: '1702' }] },
    } as MappingConfiguration;
    await expect(DamRecordWorkflowService.execute(invalidMapping, [payload], context, progress))
      .rejects.toThrow('exactly one DAM payload and one PMFieldList item');
    expect(createDam).not.toHaveBeenCalled();
  });

  it('stops at DAM creation failure without mapping', async () => {
    createDam.mockRejectedValue(new Error('Classification permission denied'));
    await expect(DamRecordWorkflowService.execute(mapping, [payload], context, progress))
      .rejects.toThrow('Classification permission denied');
    expect(progress.workflowStage).toBe('DAM_RECORD_CREATE');
    expect(createMapping).not.toHaveBeenCalled();
    expect(associate).not.toHaveBeenCalled();
    expect(markPass).not.toHaveBeenCalled();
  });

  it('stops at mapping failure without associating the asset', async () => {
    createMapping.mockRejectedValue(new Error('Mapping API unavailable'));
    await expect(DamRecordWorkflowService.execute(mapping, [payload], context, progress))
      .rejects.toThrow('Mapping API unavailable');
    expect(progress.workflowStage).toBe('PM_DAM_MAPPING');
    expect(associate).not.toHaveBeenCalled();
    expect(markPass).not.toHaveBeenCalled();
  });

  it('does not mark Pass when association fails', async () => {
    associate.mockRejectedValue(new Error('PM project association rejected'));
    await expect(DamRecordWorkflowService.execute(mapping, [payload], context, progress))
      .rejects.toThrow('PM project association rejected');
    expect(progress.workflowStage).toBe('PM_PROJECT_ASSOCIATION');
    expect(markPass).not.toHaveBeenCalled();
  });

  it('propagates status-update failure with the correct workflow stage', async () => {
    markPass.mockRejectedValue(new Error('CU Status update failed'));
    await expect(DamRecordWorkflowService.execute(mapping, [payload], context, progress))
      .rejects.toThrow('CU Status update failed');
    expect(progress.workflowStage).toBe('PM_PROJECT_STATUS_PASS');
  });
});
