import { CreateDamRecordService } from '../../services/CreateDamRecordService';
import { PmProjectService } from '../../services/pmProjectService';
import { DamRecordWorkflowService } from '../../services/DamRecordWorkflowService';
import { IsolatedDamRecordTestService } from '../../services/IsolatedDamRecordTestService';
import { PmProjectWorkflowService } from '../../services/PmProjectWorkflowService';
import { ProjectConfigurationResolver } from '../../utils/projectConfigurationResolver';
import { WorkflowTestConfig } from '../../utils/workflowTestConfig';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../services/pmProjectService', () => ({
  PmProjectService: { getProjectDetails: jest.fn() },
}));
jest.mock('../../utils/projectConfigurationResolver', () => ({
  ProjectConfigurationResolver: {
    resolveConfiguration: jest.fn(),
    buildPayloads: jest.fn(),
  },
}));
jest.mock('../../utils/workflowTestConfig', () => ({
  WorkflowTestConfig: { resolveInitial: jest.fn(), resolveIsolated: jest.fn() },
}));
jest.mock('../../services/DamRecordWorkflowService', () => ({
  DamRecordWorkflowService: { execute: jest.fn() },
}));
jest.mock('../../services/IsolatedDamRecordTestService', () => ({
  IsolatedDamRecordTestService: { execute: jest.fn() },
}));
jest.mock('../../services/PmProjectWorkflowService', () => ({
  PmProjectWorkflowService: {
    markPass: jest.fn(),
    markFail: jest.fn(),
    closeTask: jest.fn(),
  },
}));

const projectId = 274801;
const taskId = 2301827;
const environment = 'development';
const context = { projectId, taskId, environment };
const mapping = {
  DamFieldList: {
    items: [{
      damContentType: 'MLR Approval Record',
      damProjectTitleFieldId: 'field-id',
      damClassificationId: 'classification-id',
    }],
  },
  PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
};
const payload = { status: 'draft', contentType: 'MLR Approval Record' };
const mappingResult = { format: 'FIELD_MAPPING' as const, data: mapping };
const projectDetails = {
  projectName: 'Test Project',
  extendedAttributes: [{ eaId: 9001, eaValue: '{}' }],
};
const originalEnv = { ...process.env };

const projectGet = PmProjectService.getProjectDetails as jest.Mock;
const resolveConfiguration = ProjectConfigurationResolver.resolveConfiguration as jest.Mock;
const buildPayloads = ProjectConfigurationResolver.buildPayloads as jest.Mock;
const resolveInitial = WorkflowTestConfig.resolveInitial as jest.Mock;
const resolveIsolated = WorkflowTestConfig.resolveIsolated as jest.Mock;
const fullExecute = DamRecordWorkflowService.execute as jest.Mock;
const isolatedExecute = IsolatedDamRecordTestService.execute as jest.Mock;
const markFail = PmProjectWorkflowService.markFail as jest.Mock;
const closeTask = PmProjectWorkflowService.closeTask as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv, ENABLE_PM_PROJECT_STATUS_UPDATE: 'false', ENABLE_PM_TASK_CLOSE: 'false' };
  projectGet.mockResolvedValue(projectDetails);
  resolveConfiguration.mockReturnValue(mappingResult);
  buildPayloads.mockReturnValue([payload]);
  resolveInitial.mockReturnValue({ fullFlowEnabled: false, taskCloseEnabled: false, statusEnabled: false });
  resolveIsolated.mockReturnValue({ creationEnabled: false, mappingEnabled: false, associationEnabled: false, statusEnabled: false, taskCloseEnabled: false });
  isolatedExecute.mockResolvedValue({});
  fullExecute.mockResolvedValue({
    createdDamRecords: [{ recordId: 'dam-1', statusCode: 201 }],
    pmDamMappings: [{ damRecordId: 'dam-1', assetId: 357401, versionId: 365301 }],
    pmProjectAssociations: [{ projectId, assetId: 357401 }],
    pmProjectStatus: 'Pass',
  });
  markFail.mockResolvedValue(undefined);
  closeTask.mockResolvedValue(undefined);
});

afterAll(() => { process.env = originalEnv; });

describe('CreateDamRecordService (refactored orchestrator)', () => {
  it.each([
    [0, taskId, environment, 'Invalid projectId'],
    [projectId, 0, environment, 'Invalid taskId'],
    [projectId, taskId, ' ', 'Environment is required'],
  ])('rejects invalid input without calling Aprimo: %s %s %s', async (project, task, env, message) => {
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      project as number, task as number, env as string
    )).rejects.toThrow(message as string);
    expect(projectGet).not.toHaveBeenCalled();
    expect(closeTask).not.toHaveBeenCalled();
  });

  it('runs isolated dry mode and preserves the public response', async () => {
    const result = await CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment);
    expect(projectGet).toHaveBeenCalledWith(projectId, environment);
    expect(resolveConfiguration).toHaveBeenCalledWith(projectDetails.extendedAttributes, undefined);
    expect(buildPayloads).toHaveBeenCalledWith(mapping, projectDetails, context);
    expect(resolveIsolated).toHaveBeenCalledTimes(1);
    expect(isolatedExecute).toHaveBeenCalledTimes(1);
    expect(fullExecute).not.toHaveBeenCalled();
    expect(result).toEqual({ ...mappingResult, damRecordPayloads: [payload] });
    expect(closeTask).not.toHaveBeenCalled();
  });

  it('runs full flow and closes the task at the end', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true });
    const result = await CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment, 9001);
    expect(resolveConfiguration).toHaveBeenCalledWith(projectDetails.extendedAttributes, 9001);
    expect(fullExecute).toHaveBeenCalledWith(mapping, [payload], context, expect.objectContaining({ workflowStage: 'PM_PROJECT_GET' }));
    expect(isolatedExecute).not.toHaveBeenCalled();
    expect(closeTask).toHaveBeenCalledWith(context);
    expect(result).toEqual(expect.objectContaining({ pmProjectStatus: 'Pass', closedPmTaskId: taskId }));
  });

  it('marks Fail and attempts task close when fetching the PM project fails', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true });
    projectGet.mockRejectedValue(new Error('PM GET unavailable'));
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('PM GET unavailable');
    expect(markFail).toHaveBeenCalledWith(context, 'PM GET unavailable');
    expect(closeTask).toHaveBeenCalledWith(context);
    expect(fullExecute).not.toHaveBeenCalled();
  });

  it('keeps original processing error even when status update and task close also fail', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true });
    fullExecute.mockRejectedValue(new Error('DAM classification forbidden'));
    markFail.mockRejectedValue(new Error('Status API failure'));
    closeTask.mockRejectedValue(new Error('Task close API failure'));
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('DAM classification forbidden');
    expect(markFail).toHaveBeenCalledWith(context, 'DAM classification forbidden');
    expect(closeTask).toHaveBeenCalledWith(context);
  });

  it('surfaces task-close error when processing itself succeeded', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true });
    closeTask.mockRejectedValue(new Error('Close failed'));
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('Close failed');
    expect(fullExecute).toHaveBeenCalledTimes(1);
  });

  it('does not retry an already-attempted Fail status update', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: false, taskCloseEnabled: true, statusEnabled: true });
    isolatedExecute.mockImplementation(async (...args: unknown[]) => {
      const executionProgress = args[4] as { failureStatusAttempted: boolean };
      Object.assign(executionProgress, { failureStatusAttempted: true });
      throw new Error('Fail status update already attempted');
    });
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('Fail status update already attempted');
    expect(markFail).not.toHaveBeenCalled();
    expect(closeTask).toHaveBeenCalledWith(context);
  });

  it('preserves the CLASSIFICATION response without any write flags', async () => {
    const legacy = { format: 'CLASSIFICATION' as const, data: {
      inputParameterEaId: 9001,
      inputParameters: [{ ExtAttrID: 10 }],
      resolvedBy: 'explicit',
    } };
    resolveConfiguration.mockReturnValue(legacy);
    const result = await CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment);
    expect(result).toEqual(legacy);
    expect(buildPayloads).not.toHaveBeenCalled();
    expect(fullExecute).not.toHaveBeenCalled();
    expect(isolatedExecute).not.toHaveBeenCalled();
  });

  it('rejects CLASSIFICATION for full flow and still attempts close', async () => {
    resolveInitial.mockReturnValue({ fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true });
    resolveConfiguration.mockReturnValue({ format: 'CLASSIFICATION', data: { inputParameters: [] } });
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('requires FIELD_MAPPING configuration');
    expect(markFail).toHaveBeenCalledTimes(1);
    expect(closeTask).toHaveBeenCalledWith(context);
  });

  it('does not attempt closing if the initial safety configuration is invalid', async () => {
    resolveInitial.mockImplementation(() => { throw new Error('Wrong test task ID'); });
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, environment))
      .rejects.toThrow('Wrong test task ID');
    expect(projectGet).not.toHaveBeenCalled();
    expect(closeTask).not.toHaveBeenCalled();
  });
});
