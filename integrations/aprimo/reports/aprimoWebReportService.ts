import config from '../../../config/env';
import httpClient from '../../../services/httpClient';
import logger from '../../../utils/logger';

interface AppConfig {
  APRIMO_PM_BASE_URL?: string;
  APRIMO_API_VERSION?: string;
}

export interface WebReportRequest {
  path: string;
  correlationId?: string;
  environment?: string;
}

export class AprimoWebReportService {
  public static async execute<TResponse>(
    request: WebReportRequest
  ): Promise<TResponse> {
    const appConfig = config as AppConfig;
    const baseURL = appConfig.APRIMO_PM_BASE_URL?.trim();
    if (!baseURL) {
      throw new Error('APRIMO_PM_BASE_URL is not configured');
    }

    const path = request.path.trim();
    if (
      !path ||
      /^\/?\//.test(path) ||
      /^[a-z][\w+.-]*:/i.test(path) ||
      path.split(/[/?#]/).includes('..') ||
      path.includes('\\')
    ) {
      throw new Error('Web Report path must be a safe relative Aprimo API path');
    }

    const context = {
      correlationId: request.correlationId,
      environment: request.environment,
      stage: 'WEB_REPORT',
    };
    const startedAt = Date.now();
    logger.info({ msg: 'Aprimo Web Report request started', options: context });

    try {
      const response = await httpClient.get<TResponse>(path.replace(/^\//, ''), {
        baseURL,
        headers: { 'API-VERSION': appConfig.APRIMO_API_VERSION ?? '1' },
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
