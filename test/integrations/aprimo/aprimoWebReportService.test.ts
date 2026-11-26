import config from '../../../../config/env';
import httpClient from '../../../../services/httpClient';
import logger from '../../../../utils/logger';
import {
  AprimoWebReportService,
} from '../../../../integrations/aprimo/reports/aprimoWebReportService';

jest.mock('../../../../config/env', () => ({
  __esModule: true,
  default: { APRIMO_PM_BASE_URL: 'https://pm.example.test/', APRIMO_API_VERSION: '1' },
}));
jest.mock('../../../../services/httpClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe('AprimoWebReportService', () => {
  const get = httpClient.get as jest.Mock;
  const appConfig = config as { APRIMO_PM_BASE_URL?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    appConfig.APRIMO_PM_BASE_URL = 'https://pm.example.test/';
    get.mockResolvedValue({ data: { reportDetails: { rows: [] } }, status: 200 });
  });

  it('reuses shared HTTP client and passes correlation context to logs', async () => {
    const response = await AprimoWebReportService.execute({
      path: 'api/custom-report?itemId=123',
      environment: 'development',
      correlationId: '1000',
    });
    expect(response).toEqual({ reportDetails: { rows: [] } });
    expect(get).toHaveBeenCalledWith('api/custom-report?itemId=123', {
      baseURL: 'https://pm.example.test/',
      headers: { 'API-VERSION': '1' },
    });
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'Aprimo Web Report request completed',
      options: expect.objectContaining({ correlationId: '1000', statusCode: 200 }),
    });
  });

  it('rejects an absolute URL and never calls the shared HTTP client', async () => {
    await expect(
      AprimoWebReportService.execute({ path: 'https://untrusted.test/report' })
    ).rejects.toThrow(/relative/);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a missing base URL', async () => {
    appConfig.APRIMO_PM_BASE_URL = undefined;
    await expect(
      AprimoWebReportService.execute({ path: 'api/report' })
    ).rejects.toThrow('APRIMO_PM_BASE_URL is not configured');
  });

  it('logs API errors without exposing response payloads', async () => {
    get.mockRejectedValue(new Error('Request failed'));
    await expect(
      AprimoWebReportService.execute({ path: 'api/report', correlationId: '1000' })
    ).rejects.toThrow('Failed to execute Aprimo Web Report');
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'Aprimo Web Report request failed',
      options: expect.objectContaining({ correlationId: '1000' }),
    });
  });
});
