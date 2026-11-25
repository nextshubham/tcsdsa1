export type FieldReadStatus =
  | 'RAW_VALUE'
  | 'CONSTANT'
  | 'PENDING_WEB_REPORT'
  | 'MISSING'
  | 'UNSUPPORTED_SHAPE';

export interface FieldConcatReadResult {
  fieldId: string;
  fieldName: string;
  dataType: string;
  objectType: string;
  operation: string;
  status: FieldReadStatus;
  rawValue?: string | string[];
  pendingSteps: string[];
}

export interface FieldConcatReadOnlyPreview {
  projectId: number;
  taskId: number;
  activityId?: number;
  separator: string;
  inputFieldCount: number;
  outputFieldCount: number;
  fields: FieldConcatReadResult[];
  processingCompleted: false;
}
