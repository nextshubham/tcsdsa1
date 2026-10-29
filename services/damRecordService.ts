
import type { DamRecordPayload } from '../utils/damRecordPayloadBuilder';

import { RECORD_HEADERS } from '../constants/aprimo';
import { httpsAgent } from '../constants/httpAgent';
import { logAprimoRequestError } from '../utils/aprimoErrorLogger';
import logger from '../utils/logger';
import httpClient from './httpClient';

interface DamCreateApiResponse {
  recordID?: string;
  recordId?: string;
  id?: string;
}

export interface DamRecordCreationResult {
  recordId: string;
  statusCode: number;
}

export class DamRecordService {
  private static readonly CREATE_RECORD_URL = '/api/core/records';

  private static validatePayload(
    payload: DamRecordPayload
  ): void {
    if (!payload?.contentType?.trim()) {
      throw new Error('DAM contentType is required');
    }

    if (!payload.status?.trim()) {
      throw new Error('DAM record status is required');
    }

    if (!payload.fields?.addOrUpdate?.length) {
      throw new Error('DAM record fields are required');
    }

    if (!payload.classifications?.addOrUpdate?.length) {
      throw new Error('DAM record classifications are required');
    }
  }

  private static getCreatedRecordId(
    response: DamCreateApiResponse
  ): string {
    const recordId =
      response?.recordID ??
      response?.recordId ??
      response?.id;

    if (
      typeof recordId !== 'string' ||
      !recordId.trim()
    ) {
      throw new Error(
        'DAM Create Record API response does not contain record ID'
      );
    }

    return recordId.trim();
  }

  public static async createDamRecord(
    payload: DamRecordPayload
  ): Promise<DamRecordCreationResult> {
    // Step 1: Validate DAM record payload
    DamRecordService.validatePayload(payload);

    logger.info({
      msg: 'Calling Aprimo DAM Create Record API',
      options: {
        contentType: payload.contentType,
        status: payload.status,
        fieldCount: payload.fields.addOrUpdate.length,
        classificationCount:
          payload.classifications.addOrUpdate.length,
      },
    });

    try {
      // Step 2: Call Aprimo DAM Create Record API
      const response =
        await httpClient.post<DamCreateApiResponse>(
          DamRecordService.CREATE_RECORD_URL,
          payload,
          {
            headers: {
              ...RECORD_HEADERS,
              'Content-Type': 'application/json',
            },
            httpsAgent,
          }
        );

      // Step 3: Extract newly created record ID
      const recordId =
        DamRecordService.getCreatedRecordId(
          response.data
        );

      // Step 4: Log successful record creation
      logger.info({
        msg: 'Aprimo DAM record created successfully',
        options: {
          recordId,
          statusCode: response.status,
        },
      });

      // Step 5: Return result
      return {
        recordId,
        statusCode: response.status,
      };
    } catch (error) {
      logAprimoRequestError(
        error,
        'Aprimo DAM Create Record API request failed'
      );

      throw error;
    }
  }
}
