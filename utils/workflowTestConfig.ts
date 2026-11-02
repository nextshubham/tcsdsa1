import logger from './logger';
import type { DamRecordPayload } from './damRecordPayloadBuilder';
import type {
  InitialWorkflowFlags,
  IsolatedWorkflowFlags,
  PmProjectStatusResult,
  WorkflowContext,
} from '../models/createDamRecordWorkflow';

export class WorkflowTestConfig {
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

  // Step 10: close only an explicitly identified task in development.
  // This is an isolated test, not automatic end-to-end task completion.
  private static isPmTaskCloseEnabledForTest(
    projectId: number,
    taskId: number
  ): boolean {
    if (process.env.ENABLE_PM_TASK_CLOSE !== 'true') {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Controlled PM Task close is only allowed in development'
      );
    }

    const testProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();

    if (!testProjectId || testProjectId !== String(projectId)) {
      throw new Error(
        'PM Task close is not enabled for this test project'
      );
    }

    // Verify the webhook ObjectId against an explicitly approved task ID.
    // This prevents accidentally closing another task in the same project.
    const testTaskId = process.env.PM_TASK_CLOSE_TEST_TASK_ID?.trim();

    if (!testTaskId || testTaskId !== String(taskId)) {
      throw new Error(
        'PM Task close is not enabled for this test task'
      );
    }

    return true;
  }

  // End-to-end integration is opt-in and restricted to one approved
  // development project and task. Existing isolated flags remain intact.
  private static isFullFlowEnabledForTest(
    projectId: number,
    taskId: number
  ): boolean {
    if (process.env.ENABLE_CREATE_DAM_RECORD_FULL_FLOW !== 'true') {
      return false;
    }

    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Create DAM Record full flow is only allowed in development'
      );
    }

    const allowedProjectId =
      process.env.DAM_CREATE_TEST_PROJECT_ID?.trim();
    const allowedTaskId =
      process.env.PM_TASK_CLOSE_TEST_TASK_ID?.trim();

    if (
      allowedProjectId !== String(projectId) ||
      allowedTaskId !== String(taskId)
    ) {
      throw new Error(
        'Create DAM Record full flow is not enabled for this project and task'
      );
    }

    const isolatedTestFlags = [
      process.env.ENABLE_DAM_RECORD_CREATION,
      process.env.ENABLE_PM_DAM_MAPPING,
      process.env.ENABLE_PM_PROJECT_ASSOCIATION,
      process.env.ENABLE_PM_PROJECT_STATUS_UPDATE,
      process.env.ENABLE_PM_TASK_CLOSE,
    ];

    if (isolatedTestFlags.some((flag) => flag === 'true')) {
      throw new Error(
        'Disable all isolated write-test flags when using full flow'
      );
    }

    return true;
  }

  public static resolveInitial(
    context: WorkflowContext
  ): InitialWorkflowFlags {
    const { projectId, taskId } = context;
    const fullFlowEnabled = WorkflowTestConfig.isFullFlowEnabledForTest(
      projectId,
      taskId
    );
    const taskCloseEnabled =
      fullFlowEnabled ||
      WorkflowTestConfig.isPmTaskCloseEnabledForTest(projectId, taskId);
    const statusEnabled =
      fullFlowEnabled ||
      WorkflowTestConfig.isPmProjectStatusEnabledForTest(projectId);

    // Reject misconfigured modes before processing or closing a task.
    if (
      taskCloseEnabled &&
      (process.env.ENABLE_DAM_RECORD_CREATION === 'true' ||
        process.env.ENABLE_PM_DAM_MAPPING === 'true' ||
        process.env.ENABLE_PM_PROJECT_ASSOCIATION === 'true')
    ) {
      throw new Error(
        'Disable DAM creation, PM mapping and association when testing PM Task close'
      );
    }

    const statusTestResult =
      statusEnabled && !fullFlowEnabled
        ? WorkflowTestConfig.getPmProjectStatusTestResult()
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

    return {
      fullFlowEnabled,
      taskCloseEnabled,
      statusEnabled,
      statusTestResult,
      statusTestErrorMessage,
    };
  }

  public static resolveIsolated(
    context: WorkflowContext,
    initialFlags: InitialWorkflowFlags,
    damRecordPayloads: DamRecordPayload[]
  ): IsolatedWorkflowFlags {
    const { projectId, taskId, environment } = context;
    const { statusEnabled, taskCloseEnabled, statusTestResult } = initialFlags;
    const creationEnabled = WorkflowTestConfig.isDamCreationEnabledForTest(
      projectId
    );
    const mappingEnabled = WorkflowTestConfig.isPmMappingEnabledForTest(
      projectId
    );
    const associationEnabled =
      WorkflowTestConfig.isPmProjectAssociationEnabledForTest(projectId);

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

    if (creationEnabled && mappingEnabled) {
      throw new Error('Disable DAM creation when testing PM DAM mapping');
    }

    if (associationEnabled && (creationEnabled || mappingEnabled)) {
      throw new Error(
        'Disable DAM creation and PM DAM mapping when testing project association'
      );
    }

    if (statusEnabled && (creationEnabled || mappingEnabled || associationEnabled)) {
      throw new Error(
        'Disable DAM creation, PM mapping and association when testing PM Project status'
      );
    }

    logger.info({
      msg: 'PM Task close configuration check',
      options: { projectId, taskId, environment, taskCloseEnabled },
    });
    logger.info({
      msg: 'PM Project status configuration check',
      options: { projectId, statusEnabled, statusTestResult },
    });

    const associationTestAssetId = associationEnabled
      ? WorkflowTestConfig.getPmProjectAssociationTestAssetId()
      : undefined;

    if (
      (creationEnabled ||
        mappingEnabled ||
        associationEnabled ||
        statusEnabled ||
        taskCloseEnabled) &&
      damRecordPayloads.length !== 1
    ) {
      throw new Error('Controlled integration test requires exactly one DAM payload');
    }

    return {
      creationEnabled,
      mappingEnabled,
      associationEnabled,
      associationTestAssetId,
      statusEnabled,
      taskCloseEnabled,
      statusTestResult,
      statusTestErrorMessage: initialFlags.statusTestErrorMessage,
    };
  }
}
