import logger from '../../../utils/logger';
import type { FieldConcatReadResult } from '../models/FieldConcatReadOnly';
import { FieldConcatFormatter } from '../utils/FieldConcatFormatter';
import { FieldConcatReadOnlyService } from './FieldConcatReadOnlyService';
import { FieldConcatPicklistService } from './FieldConcatPicklistService';
import { FieldConcatTransformationService } from './FieldConcatTransformationService';

export type FieldConcatFieldResolutionStatus = 'READY' | 'PENDING_WEB_REPORT' | 'PENDING_MAPPING' | 'ERROR';

export interface FieldConcatProcessedField extends FieldConcatReadResult {
  resolutionStatus: FieldConcatFieldResolutionStatus;
  displayValue?: string;
  resolvedValue?: string;
  reason?: string;
}

export interface FieldConcatProcessingResult {
  projectId: number;
  taskId: number;
  activityId?: number;
  separator: string;
  inputFieldCount: number;
  outputFieldCount: number;
  fields: FieldConcatProcessedField[];
  concatenatedValue: string | null;
  readyForConcatenation: boolean;
  processingCompleted: false;
}

export class FieldConcatProcessingService {
  private static isMappingOperation(operation: string): boolean {
    return /^(usemappingsheet|mappingsheet)$/i.test(
      operation.replace(/[\s_-]/g, '')
    );
  }

  private static async resolveField(
    field: FieldConcatReadResult,
    projectId: number,
    environment: string
  ): Promise<FieldConcatProcessedField> {
    const base = { ...field };
    if (field.rawValue === undefined || field.status === 'MISSING') {
      return { ...base, resolutionStatus: 'ERROR', reason: 'Source value is missing' };
    }
    if (field.status === 'UNSUPPORTED_SHAPE') {
      return { ...base, resolutionStatus: 'ERROR', reason: 'Unsupported source value shape' };
    }

    let displayValue: string;
    try {
      if (field.pendingSteps.includes('WEB_REPORT')) {
        const resolved = await FieldConcatPicklistService.resolve(
          field, String(projectId), environment
        );
        if (resolved.value === undefined) {
          return {
            ...base,
            resolutionStatus: 'PENDING_WEB_REPORT',
            reason: resolved.pendingReason,
          };
        }
        displayValue = resolved.value;
      } else if (Array.isArray(field.rawValue)) {
        return {
          ...base,
          resolutionStatus: 'ERROR',
          reason: 'Unexpected multi-value source without a selection rule',
        };
      } else {
        displayValue = field.rawValue;
      }

      if (FieldConcatProcessingService.isMappingOperation(field.operation)) {
        return {
          ...base,
          displayValue,
          resolutionStatus: 'PENDING_MAPPING',
          reason: 'Database mapping-sheet lookup is deferred',
        };
      }

      const resolvedValue = FieldConcatTransformationService.apply(
        displayValue,
        field.operation
      );
      return { ...base, displayValue, resolvedValue, resolutionStatus: 'READY' };
    } catch (error) {
      logger.error({
        msg: 'FCU field processing failed',
        options: {
          correlationId: String(projectId),
          fieldId: field.fieldId,
          objectType: field.objectType,
          stage: 'FIELD_TRANSFORMATION',
          error: error instanceof Error ? error.message : 'Field processing failed',
        },
      });
      return {
        ...base,
        resolutionStatus: 'ERROR',
        reason: error instanceof Error ? error.message : 'Field processing failed',
      };
    }
  }

  public static async preview(
    projectId: number,
    taskId: number,
    environment: string
  ): Promise<FieldConcatProcessingResult> {
    const startedAt = Date.now();
    const context = {
      correlationId: String(projectId),
      projectId,
      taskId,
      environment,
      stage: 'CONCATENATION_PREVIEW',
    };
    let outcome = 'FAILED';
    logger.info({ msg: 'FCU concatenation preview processing started', options: context });
    try {
      const original = await FieldConcatReadOnlyService.preview(
        projectId, taskId, environment
      );
      const fields: FieldConcatProcessedField[] = [];
      for (const field of original.fields) {
        fields.push(await FieldConcatProcessingService.resolveField(
          field, projectId, environment
        ));
      }
      const readyForConcatenation = fields.every(
        (field) => field.resolutionStatus === 'READY'
      );
      const concatenatedValue = readyForConcatenation
        ? FieldConcatFormatter.join(
            fields.map((field) => field.resolvedValue as string),
            original.separator
          )
        : null;
      const statuses = fields.reduce<Record<string, number>>((result, field) => {
        result[field.resolutionStatus] = (result[field.resolutionStatus] ?? 0) + 1;
        return result;
      }, {});
      outcome = readyForConcatenation ? 'READY' : 'INCOMPLETE';
      logger.info({
        msg: 'FCU concatenation preview field processing completed',
        options: {
          ...context,
          activityId: original.activityId,
          fieldCount: fields.length,
          statuses,
          readyForConcatenation,
        },
      });
      return {
        ...original,
        fields,
        concatenatedValue,
        readyForConcatenation,
        processingCompleted: false,
      };
    } catch (error) {
      logger.error({
        msg: 'FCU concatenation preview processing failed',
        options: {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      logger.info({
        msg: 'FCU concatenation preview processing ended',
        options: { ...context, outcome, durationMs: Date.now() - startedAt },
      });
    }
  }
}
