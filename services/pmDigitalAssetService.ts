
import config from '../config/env';
import logger from '../utils/logger';
import httpClient from './httpClient';

interface PmDamMappingResponse {
  assetId: number;
  versionId: number;
}

export class PmDigitalAssetService {
  private static readonly MAPPING_URL =
    '/api/digital-assets/dam-mapping';

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

  private static parsePositiveId(
    value: unknown
  ): number | null {
    let parsedId: number;

    if (typeof value === 'number') {
      parsedId = value;
    } else if (
      typeof value === 'string' &&
      /^\d+$/.test(value.trim())
    ) {
      parsedId = Number(value.trim());
    } else {
      return null;
    }

    if (
      !Number.isSafeInteger(parsedId) ||
      parsedId <= 0
    ) {
      return null;
    }

    return parsedId;
  }

  private static extractMappingIds(
    responseData: unknown
  ): PmDamMappingResponse {
    const data =
      responseData !== null &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData)
        ? (responseData as Record<string, unknown>)
        : null;

    const rawAssetId = data?.assetId ?? data?.assetid;

    const assetId =
      PmDigitalAssetService.parsePositiveId(
        rawAssetId
      );

    // Aprimo PM returns version details inside _embedded.
    const embeddedVersions: unknown[] =
      Array.isArray(data?._embedded)
        ? data._embedded
        : [];

    // Select the default version belonging to this asset.
    const defaultVersion = embeddedVersions
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item)
      )
      .find(
        (item) =>
          item.isDefaultVersion === true &&
          PmDigitalAssetService.parsePositiveId(
            item.digitalAssetId
          ) === assetId
      );

    // Also support the earlier flat response format.
    const rawVersionId =
      data?.versionId ??
      data?.versionid ??
      defaultVersion?.versionId ??
      defaultVersion?.versionid;

    const versionId =
      PmDigitalAssetService.parsePositiveId(
        rawVersionId
      );

    logger.info({
      msg: 'PM DAM mapping response IDs extracted',
      options: {
        assetId,
        versionId,
        embeddedVersionCount: embeddedVersions.length,
        defaultVersionFound: Boolean(defaultVersion),
      },
    });

    if (assetId === null || versionId === null) {
      logger.error({
        msg: 'PM DAM mapping response validation failed',
        options: {
          assetIdValid: assetId !== null,
          versionIdValid: versionId !== null,
          responseKeys: data ? Object.keys(data) : [],
        },
      });

      throw new Error(
        'PM DAM mapping response contains invalid IDs'
      );
    }

    return {
      assetId,
      versionId,
    };
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
      throw new Error(
        'APRIMO_PM_BASE_URL is not configured'
      );
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
      const response = await httpClient.post<unknown>(
        PmDigitalAssetService.MAPPING_URL,
        requestBody,
        {
          baseURL,
          headers: {
            'API-VERSION':
              config.APRIMO_API_VERSION ?? '1',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      logger.info({
        msg: 'PM DAM mapping API response received',
        options: {
          statusCode: response.status,
        },
      });

      // Log full API response only in development.
      if (process.env.NODE_ENV === 'development') {
        logger.info({
          msg: 'PM DAM mapping raw API response',
          options: {
            statusCode: response.status,
            responseBody: response.data,
          },
        });
      }

      const mappingResult =
        PmDigitalAssetService.extractMappingIds(
          response.data
        );

      logger.info({
        msg: 'PM DAM mapping created successfully',
        options: {
          damRecordId: validatedRecordId,
          assetId: mappingResult.assetId,
          versionId: mappingResult.versionId,
          statusCode: response.status,
        },
      });

      return mappingResult;
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
