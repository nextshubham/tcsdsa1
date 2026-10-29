
import config from '../config/env';
import logger from '../utils/logger';
import httpClient from './httpClient';

interface PmDamMappingResponse {
  assetId: number;
  versionId: number;
}

export class PmDigitalAssetService {
  private static readonly MAPPING_URL =
    '/digital-assets/dam-mapping';

  private static validateDamRecordId(
    damRecordId: string
  ): string {
    if (
      typeof damRecordId !== 'string' ||
      !damRecordId.trim()
    ) {
      throw new Error('DAM record ID is required');
    }

    return damRecordId.trim();
  }

  private static validateAssetTypeId(
    assetTypeId: string | number
  ): number {
    const value = String(assetTypeId).trim();

    if (!/^\d+$/.test(value)) {
      throw new Error('Invalid PM asset type ID');
    }

    const parsedId = Number(value);

    if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
      throw new Error('Invalid PM asset type ID');
    }

    return parsedId;
  }

  public static async createDamMapping(
    damRecordId: string,
    pmDigitalAssetTypeId: string | number
  ): Promise<PmDamMappingResponse> {
    const validatedRecordId =
      PmDigitalAssetService.validateDamRecordId(
        damRecordId
      );

    const assetTypeId =
      PmDigitalAssetService.validateAssetTypeId(
        pmDigitalAssetTypeId
      );

    const baseURL = config.APRIMO_PM_BASE_URL?.trim();

    if (!baseURL) {
      throw new Error('APRIMO_PM_BASE_URL is not configured');
    }

    const requestBody = {
      damRecordId: validatedRecordId,
      assetTypeId,
    };

    logger.info({
      msg: 'Calling PM DAM mapping API',
      options: {
        damRecordId: validatedRecordId,
        assetTypeId,
      },
    });

    try {
      const response =
        await httpClient.post<PmDamMappingResponse>(
          PmDigitalAssetService.MAPPING_URL,
          requestBody,
          {
            baseURL,
            headers: {
              'API-VERSION': config.APRIMO_API_VERSION ?? '1',
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          }
        );

      const { assetId, versionId } = response.data;

      if (
        !Number.isSafeInteger(assetId) ||
        assetId <= 0 ||
        !Number.isSafeInteger(versionId) ||
        versionId <= 0
      ) {
        throw new Error(
          'PM DAM mapping response contains invalid IDs'
        );
      }

      logger.info({
        msg: 'PM DAM mapping created successfully',
        options: {
          damRecordId: validatedRecordId,
          assetId,
          versionId,
          statusCode: response.status,
        },
      });

      return {
        assetId,
        versionId,
      };
    } catch (error) {
      logger.error({
        msg: 'PM DAM mapping creation failed',
        options: {
          damRecordId: validatedRecordId,
          assetTypeId,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        },
      });

      throw error;
    }
  }
}
