import {
  AprimoWebReportService,
} from '../../../integrations/aprimo/reports/aprimoWebReportService';
import type { FieldConcatReadResult } from '../models/FieldConcatReadOnly';

type JsonObject = Record<string, unknown>;

export interface PicklistResolution {
  value?: string;
  pendingReason?: string;
}

export class FieldConcatPicklistService {
  private static asObject(value: unknown): JsonObject | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : undefined;
  }

  private static buildPath(
    template: string,
    field: FieldConcatReadResult,
    itemId: string
  ): string {
    if (!template.includes('{itemId}')) {
      throw new Error('FCU_WEB_REPORT_PATH_TEMPLATE must include {itemId}');
    }
    const replacements: Record<string, string> = {
      itemId,
      fieldId: field.fieldId,
      objectType: field.objectType,
    };
    const path = template.replace(/\{(itemId|fieldId|objectType)\}/g, (
      _match,
      key: string
    ) => encodeURIComponent(replacements[key]));
    if (/\{[^}]+\}/.test(path)) {
      throw new Error('FCU Web Report path contains an unsupported placeholder');
    }
    return path;
  }

  private static readRows(data: unknown): JsonObject[] {
    const payload = FieldConcatPicklistService.asObject(data);
    const reportDetails = FieldConcatPicklistService.asObject(payload?.reportDetails);
    const rows = reportDetails?.rows ?? payload?.rows;
    if (!Array.isArray(rows)) {
      throw new Error('Web Report response does not contain rows');
    }
    return rows.map((row) => {
      const record = FieldConcatPicklistService.asObject(row);
      if (!record) throw new Error('Invalid Web Report row');
      return record;
    });
  }

  private static readDisplayValue(data: unknown, itemId: string): string {
    const rows = FieldConcatPicklistService.readRows(data);
    const match = rows.find((row) => String(row.listItemId) === itemId);
    const value = match?.listActualValue;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('Web Report display value not found for list item');
    }
    return String(value);
  }

  public static async resolve(
    field: FieldConcatReadResult,
    correlationId: string,
    environment: string
  ): Promise<PicklistResolution> {
    const template = process.env.FCU_WEB_REPORT_PATH_TEMPLATE?.trim();
    if (!template) {
      return { pendingReason: 'Web Report path template is not configured' };
    }
    if (field.rawValue === undefined) {
      return { pendingReason: 'Picklist item ID is unavailable' };
    }

    const ids = Array.isArray(field.rawValue)
      ? field.rawValue
      : [field.rawValue];
    if (!ids.length || ids.some((id) => !id.trim())) {
      return { pendingReason: 'Picklist item IDs are missing' };
    }

    const names: string[] = [];
    for (const itemId of ids) {
      const path = FieldConcatPicklistService.buildPath(template, field, itemId);
      const response = await AprimoWebReportService.execute<unknown>({
        path,
        correlationId,
        environment,
      });
      names.push(FieldConcatPicklistService.readDisplayValue(response, itemId));
    }

    const multiSelect = [
      'MultiselectPicklistEA',
      'MultiValuePicklistEA',
      'MultiselectEA',
    ].includes(field.dataType);
    return { value: multiSelect ? names.sort()[0] : names[0] };
  }
}
