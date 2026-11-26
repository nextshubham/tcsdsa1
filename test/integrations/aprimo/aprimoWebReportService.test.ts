import config from '../../../../config/env';
import httpClient from '../../../../services/httpClient';
import logger from '../../../../utils/logger';
import {
  AprimoWebReportService,
} from '../../../../integrations/aprimo/reports/aprimoWebReportService';

jest.mock('../../../../config/env', () => ({
  __esModule: true,
  default: {
    APRIMO_PM_BASE_URL: 'https://pm.example.test/api/',
    APRIMO_API_VERSION: '1',
  },
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
  const appConfig = config as {
    APRIMO_PM_BASE_URL?: string;
    APRIMO_API_VERSION?: string;
  };
  const previousAuthorization = process.env.APRIMO_WEB_REPORT_AUTHORIZATION;
  const report = {
    reportId: '10000',
    itemIds: ['900'],
    environment: 'development',
    correlationId: '1000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appConfig.APRIMO_PM_BASE_URL = 'https://pm.example.test/api/';
    appConfig.APRIMO_API_VERSION = '1';
    process.env.APRIMO_WEB_REPORT_AUTHORIZATION = 'Basic encoded-secret';
    get.mockResolvedValue({ data: { ReportDetails: { Rows: [] } }, status: 200 });
  });

  afterAll(() => {
    if (previousAuthorization === undefined) {
      delete process.env.APRIMO_WEB_REPORT_AUTHORIZATION;
    } else {
      process.env.APRIMO_WEB_REPORT_AUTHORIZATION = previousAuthorization;
    }
  });

  it('uses the PM host, fixed report path and explicit Basic authorization', async () => {
    const result = await AprimoWebReportService.execute(report);
    expect(result).toEqual({ ReportDetails: { Rows: [] } });
    expect(get).toHaveBeenCalledWith(
      'WebApi/api/Reports/10000?Encoded%20List%20Item%20ID=900',
      {
        baseURL: 'https://pm.example.test/',
        headers: {
          'API-VERSION': '1',
          'Content-Type': 'application/json',
          Authorization: 'Basic encoded-secret',
        },
      }
    );
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'Aprimo Web Report request completed',
      options: expect.objectContaining({
        correlationId: '1000', reportId: '10000', statusCode: 200,
      }),
    });
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls))
      .not.toContain('encoded-secret');
  });

  it('uses repeated encoded list item query parameters for multiselect', async () => {
    await AprimoWebReportService.execute({
      ...report, itemIds: ['A B', '2&3'],
    });
    expect(get).toHaveBeenCalledWith(
      'WebApi/api/Reports/10000?Encoded%20List%20Item%20ID=A%20B' +
        '&Encoded%20List%20Item%20ID=2%263',
      expect.any(Object)
    );
  });

  it('rejects invalid report identifiers and item IDs without making a request', async () => {
    await expect(AprimoWebReportService.execute({
      ...report, reportId: '../10000',
    })).rejects.toThrow('Web Report ID must be a positive numeric value');
    await expect(AprimoWebReportService.execute({
      ...report, itemIds: [' '],
    })).rejects.toThrow('Web Report requires at least one nonempty list item ID');
    expect(get).not.toHaveBeenCalled();
  });

  it('requires configured PM base URL and report authorization', async () => {
    appConfig.APRIMO_PM_BASE_URL = undefined;
    await expect(AprimoWebReportService.execute(report))
      .rejects.toThrow('APRIMO_PM_BASE_URL is not configured');
    appConfig.APRIMO_PM_BASE_URL = 'https://pm.example.test';
    delete process.env.APRIMO_WEB_REPORT_AUTHORIZATION;
    await expect(AprimoWebReportService.execute(report))
      .rejects.toThrow('APRIMO_WEB_REPORT_AUTHORIZATION is not configured');
    expect(get).not.toHaveBeenCalled();
  });

  it('logs failures with correlation ID without exposing credentials', async () => {
    get.mockRejectedValue(new Error('HTTP 503'));
    await expect(AprimoWebReportService.execute(report))
      .rejects.toThrow('Failed to execute Aprimo Web Report');
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'Aprimo Web Report request failed',
      options: expect.objectContaining({
        correlationId: '1000', error: 'HTTP 503',
      }),
    });
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls))
      .not.toContain('encoded-secret');
  });
});
