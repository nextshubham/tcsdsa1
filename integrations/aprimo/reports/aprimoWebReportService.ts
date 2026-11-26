import config from '../../../config/env';
import httpClient from '../../../services/httpClient';
import logger from '../../../utils/logger';

interface AppConfig {
  APRIMO_PM_BASE_URL?: string;
  APRIMO_API_VERSION?: string;
}

export interface WebReportRequest {
  reportId: number | string;
  itemIds: readonly string[];
  correlationId?: string;
  environment?: string;
}

export class AprimoWebReportService {
  private static readonly REPORT_PATH = 'WebApi/api/Reports/';

  private static buildRequestPath(reportId: number | string, itemIds: readonly string[]): string {
    const id = String(reportId).trim();
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new Error('Web Report ID must be a positive numeric value');
    }

    if (!itemIds.length || itemIds.some((value) => !value.trim())) {
      throw new Error('Web Report requires at least one nonempty list item ID');
    }

    const params = itemIds.map((value) =>
      `Encoded%20List%20Item%20ID=${encodeURIComponent(value.trim())}`
    );
    return `${AprimoWebReportService.REPORT_PATH}${id}?${params.join('&')}`;
  }

  private static getBaseUrl(): string {
    const appConfig = config as AppConfig;
    const pmBaseUrl = appConfig.APRIMO_PM_BASE_URL?.trim();
    if (!pmBaseUrl) {
      throw new Error('APRIMO_PM_BASE_URL is not configured');
    }

    try {
      const url = new URL(pmBaseUrl);
      if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Invalid APRIMO_PM_BASE_URL protocol');
      }
      return `${url.origin}/`;
    } catch {
      throw new Error('APRIMO_PM_BASE_URL must be a valid HTTP(S) URL');
    }
  }

  public static async execute<TResponse = unknown>(
    request: WebReportRequest
  ): Promise<TResponse> {
    const baseURL = AprimoWebReportService.getBaseUrl();
    const path = AprimoWebReportService.buildRequestPath(
      request.reportId,
      request.itemIds
    );
    const authorization = process.env.APRIMO_WEB_REPORT_AUTHORIZATION?.trim();
    if (!authorization) {
      throw new Error('APRIMO_WEB_REPORT_AUTHORIZATION is not configured');
    }

    const context = {
      correlationId: request.correlationId,
      environment: request.environment,
      reportId: String(request.reportId).trim(),
      itemCount: request.itemIds.length,
      stage: 'WEB_REPORT',
    };
    const startedAt = Date.now();
    logger.info({ msg: 'Aprimo Web Report request started', options: context });

    try {
      const response = await httpClient.get<TResponse>(path, {
        baseURL,
        headers: {
          'API-VERSION': (config as AppConfig).APRIMO_API_VERSION ?? '1',
          'Content-Type': 'application/json',
          Authorization: authorization,
        },
      });
      logger.info({
        msg: 'Aprimo Web Report request completed',
        options: {
          ...context,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
        },
      });
      return response.data;
    } catch (error) {
      logger.error({
        msg: 'Aprimo Web Report request failed',
        options: {
          ...context,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startedAt,
        },
      });
      throw new Error('Failed to execute Aprimo Web Report');
    }
  }
}
