import type { FieldConcatField, FieldConcatInfo } from '../models/FieldConcatInfo';
import type { FieldConcatReadResult } from '../models/FieldConcatReadOnly';

type JsonObject = Record<string, unknown>;

type SourceContext = {
  projectId: number;
  taskId: number;
  activityId?: number;
  project: unknown;
  task: unknown;
  activity?: unknown;
};

export class FieldConcatFieldValueService {
  private static asObject(value: unknown): JsonObject | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : undefined;
  }

  private static fromEa(source: JsonObject, fieldId: string): unknown {
    const collections = [
      source.extendedAttributes,
      source.multiValueExtendedAttributes,
    ];

    for (const collection of collections) {
      if (Array.isArray(collection)) {
        const attribute = collection.find((item: unknown) => {
          const record = FieldConcatFieldValueService.asObject(item);
          return record && String(record.eaId).trim() === fieldId;
        });
        const record = FieldConcatFieldValueService.asObject(attribute);
        if (record) {
          return record.eaValue ?? record.eaValues ?? record.values;
        }
      }
    }
    return undefined;
  }

  private static fromSystemField(
    source: JsonObject,
    fieldId: string,
    objectType: string,
    context: SourceContext
  ): unknown {
    if (Object.prototype.hasOwnProperty.call(source, fieldId)) {
      return source[fieldId];
    }
    if (objectType === 'Project' && fieldId === 'projectId') {
      return context.projectId;
    }
    if (objectType === 'Task' && fieldId === 'taskId') {
      return context.taskId;
    }
    if (objectType === 'Activity' && fieldId === 'activityId') {
      return context.activityId;
    }
    return undefined;
  }

  private static pendingSteps(field: FieldConcatField): string[] {
    const steps: string[] = [];
    if (
      [
        'PicklistEA',
        'MultiselectPicklistEA',
        'MultiValuePicklistEA',
        'MultiselectEA',
      ].includes(field.dataType)
    ) {
      steps.push('WEB_REPORT');
    }
    const operation = field.fieldLogic.replace(/[\s_-]/g, '').toLowerCase();
    if (operation === 'usemappingsheet' || operation === 'mappingsheet') {
      steps.push('MAPPING_SHEET');
    } else if (operation && operation !== 'none' && operation !== 'na') {
      steps.push('TRANSFORMATION');
    }
    return steps;
  }

  private static normalizeRawValue(value: unknown): string | string[] | undefined {
    if (value === null || value === undefined) return undefined;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }
    if (
      Array.isArray(value) &&
      value.every((part) => ['string', 'number', 'boolean'].includes(typeof part))
    ) {
      return value.map((part) => String(part));
    }
    return undefined;
  }

  public static previewFields(
    config: FieldConcatInfo,
    context: SourceContext
  ): FieldConcatReadResult[] {
    return config.inputConcatFields.map((field) => {
      const base = {
        fieldId: field.fieldId,
        fieldName: field.fieldName,
        dataType: field.dataType,
        objectType: field.objectType,
        operation: field.fieldLogic,
        pendingSteps: FieldConcatFieldValueService.pendingSteps(field),
      };

      if (field.objectType === 'Constant') {
        return { ...base, status: 'CONSTANT' as const, rawValue: field.fieldId };
      }

      let selected: unknown;
      if (field.objectType === 'Project') {
        selected = context.project;
      } else if (field.objectType === 'Activity') {
        selected = context.activity;
      } else {
        selected = context.task;
      }
      const source = FieldConcatFieldValueService.asObject(selected);
      if (!source) {
        return { ...base, status: 'MISSING' as const };
      }

      const isEa = field.dataType.endsWith('EA');
      const original = isEa
        ? FieldConcatFieldValueService.fromEa(source, field.fieldId)
        : FieldConcatFieldValueService.fromSystemField(
            source, field.fieldId, field.objectType, context
          );
      const rawValue = FieldConcatFieldValueService.normalizeRawValue(original);
      if (original === null || original === undefined) {
        return { ...base, status: 'MISSING' as const };
      }
      if (rawValue === undefined) {
        return { ...base, status: 'UNSUPPORTED_SHAPE' as const };
      }

      return {
        ...base,
        status: base.pendingSteps.includes('WEB_REPORT')
          ? ('PENDING_WEB_REPORT' as const)
          : ('RAW_VALUE' as const),
        rawValue,
      };
    });
  }
}
