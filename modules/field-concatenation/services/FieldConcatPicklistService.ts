import {
  AprimoWebReportService,
} from '../../../integrations/aprimo/reports/aprimoWebReportService';
import logger from '../../../utils/logger';
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

  private static readValues(data: unknown, itemIds: readonly string[]): string[] {
    const payload = FieldConcatPicklistService.asObject(data);
    const reportDetails = FieldConcatPicklistService.asObject(payload?.ReportDetails);
    const rows = reportDetails?.Rows;
    if (!Array.isArray(rows)) {
      throw new Error('Web Report response does not contain ReportDetails.Rows');
    }

    const values = new Map<string, string>();
    rows.forEach((row) => {
      const record = FieldConcatPicklistService.asObject(row);
      if (!record) throw new Error('Invalid Web Report row');
      const itemId = record.Encoded_List_Item_ID;
      const value = record.Value__;
      if (
        (typeof itemId === 'string' || typeof itemId === 'number') &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        values.set(String(itemId), String(value));
      }
    });

    return itemIds.map((itemId) => {
      const value = values.get(itemId);
      if (value === undefined) {
        throw new Error('Web Report display value not found for list item');
      }
      return value;
    });
  }

  public static async resolve(
    field: FieldConcatReadResult,
    correlationId: string,
    environment: string
  ): Promise<PicklistResolution> {
    const reportId = process.env.FCU_WEB_REPORT_ID?.trim();
    if (!reportId) {
      return { pendingReason: 'FCU_WEB_REPORT_ID is not configured' };
    }
    if (field.rawValue === undefined) {
      return { pendingReason: 'Picklist item ID is unavailable' };
    }

    const itemIds = (Array.isArray(field.rawValue)
      ? field.rawValue
      : [field.rawValue]).map((value) => value.trim());
    if (!itemIds.length || itemIds.some((value) => !value)) {
      return { pendingReason: 'Picklist item IDs are missing' };
    }

    const context = {
      correlationId,
      environment,
      fieldId: field.fieldId,
      objectType: field.objectType,
      itemCount: itemIds.length,
      stage: 'PICKLIST_RESOLUTION',
    };
    const startedAt = Date.now();
    logger.info({ msg: 'FCU picklist resolution started', options: context });
    try {
      const response = await AprimoWebReportService.execute<unknown>({
        reportId,
        itemIds,
        correlationId,
        environment,
      });
      const names = FieldConcatPicklistService.readValues(response, itemIds);
      const multiSelect = [
        'multiselectpicklistea',
        'multivaluepicklistea',
        'multiselectea',
      ].includes(field.dataType.toLowerCase());
      const value = multiSelect ? names.sort()[0] : names[0];
      logger.info({
        msg: 'FCU picklist resolution completed',
        options: { ...context, durationMs: Date.now() - startedAt },
      });
      return { value };
    } catch (error) {
      logger.error({
        msg: 'FCU picklist resolution failed',
        options: {
          ...context,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  }
}
