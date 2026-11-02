/* Compile-time contract smoke test for the type-only workflow model.
 * These exports have no runtime behavior; this file verifies typed consumers.
 */
import type {
  InitialWorkflowFlags,
  IsolatedWorkflowFlags,
  PmDamMappingResult,
  PmProjectAssociationResult,
  PmProjectStatusResult,
  WorkflowContext,
  WorkflowProgress,
  WorkflowWriteResults,
} from '../../models/createDamRecordWorkflow';

describe('createDamRecordWorkflow type contracts', () => {
  it('allows a context and progress object for the webhook execution', () => {
    const context: WorkflowContext = { projectId: 274801, taskId: 2301827, environment: 'development' };
    const progress: WorkflowProgress = { workflowStage: 'PM_PROJECT_GET', failureStatusAttempted: false };
    expect(context.taskId).toBe(2301827);
    expect(progress.failureStatusAttempted).toBe(false);
  });

  it('exposes mapping, association and status results with stable names', () => {
    const pmDamMapping: PmDamMappingResult = { damRecordId: 'dam-1', assetId: 357401, versionId: 365301 };
    const association: PmProjectAssociationResult = { projectId: 274801, assetId: 357401 };
    const status: PmProjectStatusResult = 'Pass';
    const results: WorkflowWriteResults = {
      pmDamMappings: [pmDamMapping],
      pmProjectAssociations: [association],
      pmProjectStatus: status,
    };
    expect(results.pmDamMappings?.[0].assetId).toBe(357401);
    expect(results.pmProjectStatus).toBe('Pass');
  });

  it('keeps the test-mode flag contracts separate', () => {
    const initial: InitialWorkflowFlags = { fullFlowEnabled: true, taskCloseEnabled: true, statusEnabled: true };
    const isolated: IsolatedWorkflowFlags = {
      creationEnabled: false,
      mappingEnabled: false,
      associationEnabled: false,
      statusEnabled: false,
      taskCloseEnabled: false,
    };
    expect(initial.fullFlowEnabled).toBe(true);
    expect(isolated.creationEnabled).toBe(false);
  });
});
