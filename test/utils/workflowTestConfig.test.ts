import { WorkflowTestConfig } from '../../utils/workflowTestConfig';
import type { InitialWorkflowFlags, WorkflowContext } from '../../models/createDamRecordWorkflow';
import type { DamRecordPayload } from '../../utils/damRecordPayloadBuilder';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const context: WorkflowContext = { projectId: 274801, taskId: 2301827, environment: 'development' };
const payloads = [{ status: 'draft', contentType: 'MLR Approval Record' }] as DamRecordPayload[];
const originalEnv = { ...process.env };
const initialOff: InitialWorkflowFlags = {
  fullFlowEnabled: false,
  taskCloseEnabled: false,
  statusEnabled: false,
};

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'development',
    DAM_CREATE_TEST_PROJECT_ID: String(context.projectId),
    PM_TASK_CLOSE_TEST_TASK_ID: String(context.taskId),
    ENABLE_CREATE_DAM_RECORD_FULL_FLOW: 'false',
    ENABLE_DAM_RECORD_CREATION: 'false',
    ENABLE_PM_DAM_MAPPING: 'false',
    ENABLE_PM_PROJECT_ASSOCIATION: 'false',
    ENABLE_PM_PROJECT_STATUS_UPDATE: 'false',
    ENABLE_PM_TASK_CLOSE: 'false',
  };
});
afterAll(() => { process.env = originalEnv; });

describe('WorkflowTestConfig', () => {
  it('disables all writes by default', () => {
    expect(WorkflowTestConfig.resolveInitial(context))
      .toEqual(expect.objectContaining(initialOff));
    expect(WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toEqual(expect.objectContaining({
        creationEnabled: false,
        mappingEnabled: false,
        associationEnabled: false,
        statusEnabled: false,
        taskCloseEnabled: false,
      }));
  });

  it('enables full flow in DEV for any valid webhook project/task without test IDs', () => {
    process.env.ENABLE_CREATE_DAM_RECORD_FULL_FLOW = 'true';
    delete process.env.DAM_CREATE_TEST_PROJECT_ID;
    delete process.env.PM_TASK_CLOSE_TEST_TASK_ID;
    expect(WorkflowTestConfig.resolveInitial(context)).toEqual({
      fullFlowEnabled: true,
      taskCloseEnabled: true,
      statusEnabled: true,
      statusTestResult: undefined,
      statusTestErrorMessage: undefined,
    });
    const secondContext: WorkflowContext = {
      projectId: 987654,
      taskId: 1234567,
      environment: 'development',
    };
    expect(WorkflowTestConfig.resolveInitial(secondContext))
      .toEqual(expect.objectContaining({
        fullFlowEnabled: true,
        taskCloseEnabled: true,
        statusEnabled: true,
      }));
  });

  it('rejects full flow outside development', () => {
    process.env.ENABLE_CREATE_DAM_RECORD_FULL_FLOW = 'true';
    process.env.NODE_ENV = 'production';
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('only allowed in development');
  });

  it('accepts full flow with different project/task IDs, regardless of test-ID variables', () => {
    process.env.ENABLE_CREATE_DAM_RECORD_FULL_FLOW = 'true';
    process.env.DAM_CREATE_TEST_PROJECT_ID = '100';
    process.env.PM_TASK_CLOSE_TEST_TASK_ID = '200';
    expect(WorkflowTestConfig.resolveInitial(context).fullFlowEnabled).toBe(true);
  });

  it('rejects mixing full flow with any isolated write flag', () => {
    process.env.ENABLE_CREATE_DAM_RECORD_FULL_FLOW = 'true';
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('Disable all isolated write-test flags');
  });

  it('enables isolated DAM creation only for its approved project', () => {
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    expect(WorkflowTestConfig.resolveIsolated(context, initialOff, payloads).creationEnabled).toBe(true);
    process.env.DAM_CREATE_TEST_PROJECT_ID = '100';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toThrow('DAM creation is not enabled for this test project');
  });

  it('enables isolated mapping and rejects mapping + creation together', () => {
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    expect(WorkflowTestConfig.resolveIsolated(context, initialOff, payloads).mappingEnabled).toBe(true);
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toThrow('Disable DAM creation when testing PM DAM mapping');
  });

  it('rejects association if any other DAM write is enabled', () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toThrow('Disable DAM creation and PM DAM mapping');
  });

  it('requires a positive safe asset ID for association-only testing', () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID = '357401';
    expect(WorkflowTestConfig.resolveIsolated(context, initialOff, payloads).associationTestAssetId)
      .toBe(357401);
    process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID = '-1';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toThrow('must be a positive integer');
    process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID = '9007199254740992';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, payloads))
      .toThrow('must be a positive integer');
  });

  it('allows status-only Pass selection for approved development project', () => {
    process.env.ENABLE_PM_PROJECT_STATUS_UPDATE = 'true';
    process.env.PM_PROJECT_STATUS_TEST_RESULT = 'Pass';
    const initial = WorkflowTestConfig.resolveInitial(context);
    expect(initial.statusEnabled).toBe(true);
    expect(initial.statusTestResult).toBe('Pass');
    expect(WorkflowTestConfig.resolveIsolated(context, initial, payloads).statusEnabled).toBe(true);
  });

  it('requires the explicit Fail message', () => {
    process.env.ENABLE_PM_PROJECT_STATUS_UPDATE = 'true';
    process.env.PM_PROJECT_STATUS_TEST_RESULT = 'Fail';
    delete process.env.PM_PROJECT_STATUS_TEST_ERROR_MESSAGE;
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('PM_PROJECT_STATUS_TEST_ERROR_MESSAGE is required');
    process.env.PM_PROJECT_STATUS_TEST_ERROR_MESSAGE = 'Controlled fail test';
    expect(WorkflowTestConfig.resolveInitial(context).statusTestErrorMessage)
      .toBe('Controlled fail test');
  });

  it('rejects invalid status values when status updates are enabled', () => {
    process.env.ENABLE_PM_PROJECT_STATUS_UPDATE = 'true';
    process.env.PM_PROJECT_STATUS_TEST_RESULT = 'false';
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('must be Pass or Fail');
  });

  it('allows approved isolated task-close mode and rejects a wrong task ID', () => {
    process.env.ENABLE_PM_TASK_CLOSE = 'true';
    expect(WorkflowTestConfig.resolveInitial(context).taskCloseEnabled).toBe(true);
    process.env.PM_TASK_CLOSE_TEST_TASK_ID = '111';
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('not enabled for this test task');
  });

  it('rejects task close combined with DAM creation', () => {
    process.env.ENABLE_PM_TASK_CLOSE = 'true';
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    expect(() => WorkflowTestConfig.resolveInitial(context))
      .toThrow('Disable DAM creation, PM mapping and association');
  });

  it('prevents status testing combined with association', () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID = '357401';
    const initial = { ...initialOff, statusEnabled: true, statusTestResult: 'Pass' as const };
    expect(() => WorkflowTestConfig.resolveIsolated(context, initial, payloads))
      .toThrow('Disable DAM creation, PM mapping and association');
  });

  it('rejects multiple payloads for any active isolated write test', () => {
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    expect(() => WorkflowTestConfig.resolveIsolated(context, initialOff, [...payloads, ...payloads]))
      .toThrow('exactly one DAM payload');
  });
});
