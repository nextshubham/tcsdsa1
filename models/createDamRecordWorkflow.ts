import type { ResolvedProjectConfiguration } from './pmClassification';
import type { DamRecordPayload } from '../utils/damRecordPayloadBuilder';
import type { DamRecordCreationResult } from '../services/damRecordService';

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

export interface WorkflowContext {
  projectId: number;
  taskId: number;
  environment: string;
}

export interface WorkflowProgress {
  workflowStage: string;
  failureStatusAttempted: boolean;
}

export type MappingConfiguration = Extract<
  ResolvedProjectConfiguration,
  { format: 'FIELD_MAPPING' }
>['data'];

export interface WorkflowWriteResults {
  createdDamRecords?: DamRecordCreationResult[];
  pmDamMappings?: PmDamMappingResult[];
  pmProjectAssociations?: PmProjectAssociationResult[];
  pmProjectStatus?: PmProjectStatusResult;
}

export interface InitialWorkflowFlags {
  fullFlowEnabled: boolean;
  taskCloseEnabled: boolean;
  statusEnabled: boolean;
  statusTestResult?: PmProjectStatusResult;
  statusTestErrorMessage?: string;
}

export interface IsolatedWorkflowFlags {
  creationEnabled: boolean;
  mappingEnabled: boolean;
  associationEnabled: boolean;
  associationTestAssetId?: number;
  statusEnabled: boolean;
  taskCloseEnabled: boolean;
  statusTestResult?: PmProjectStatusResult;
  statusTestErrorMessage?: string;
}

export type CreateDamRecordResolutionResult =
  | Extract<ResolvedProjectConfiguration, { format: 'CLASSIFICATION' }>
  | (Extract<ResolvedProjectConfiguration, { format: 'FIELD_MAPPING' }> & {
      damRecordPayloads: DamRecordPayload[];
      closedPmTaskId?: number;
    } & WorkflowWriteResults);
