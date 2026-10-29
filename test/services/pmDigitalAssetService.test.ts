import config from '../../config/env';
import logger from '../../utils/logger';
import httpClient from '../../services/httpClient';
import { PmDigitalAssetService } from '../../services/pmDigitalAssetService';

jest.mock('../../services/httpClient', () => ({
  __esModule: true,
  default: { post: jest.fn(), put: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  __esModule: true,
  default: { APRIMO_PM_BASE_URL: 'https://pm.example.test', APRIMO_API_VERSION: '1' },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

describe('PmDigitalAssetService', () => {
  const mockPost = httpClient.post as jest.Mock;
  const mockPut = httpClient.put as jest.Mock;

  beforeEach(() => { jest.resetAllMocks(); });

  it('should create PM/DAM mapping successfully', async () => {
    mockPost.mockResolvedValue({ status: 201, data: { assetId: 123456, versionId: 789012 } });
    const result = await PmDigitalAssetService.createDamMapping(
      '5cb9e131f8d44b6da0fe43d0ca22ab7', '1701'
    );
    expect(result).toEqual({ assetId: 123456, versionId: 789012 });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/digital-assets/dam-mapping',
      { damRecordId: '5cb9e131f8d44b6da0fe43d0ca22ab7', assetTypeId: 1701 },
      expect.objectContaining({
        baseURL: config.APRIMO_PM_BASE_URL,
        headers: expect.objectContaining({
          'API-VERSION': '1', 'Content-Type': 'application/json', Accept: 'application/json',
        }),
      })
    );
  });

  it('should accept numeric PM asset type ID', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { assetId: 123456, versionId: 789012 } });
    const result = await PmDigitalAssetService.createDamMapping('test-dam-record-id', 1701);
    expect(result.assetId).toBe(123456);
    expect(result.versionId).toBe(789012);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/digital-assets/dam-mapping',
      { damRecordId: 'test-dam-record-id', assetTypeId: 1701 },
      expect.any(Object)
    );
  });

  it('should reject missing DAM record ID', async () => {
    await expect(PmDigitalAssetService.createDamMapping('', '1701'))
      .rejects.toThrow('DAM record ID is required');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should reject invalid PM asset type ID', async () => {
    await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', 'invalid-id'))
      .rejects.toThrow('Invalid PM asset type ID');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should reject zero PM asset type ID', async () => {
    await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', 0))
      .rejects.toThrow('Invalid PM asset type ID');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should reject invalid assetId in API response', async () => {
    mockPost.mockResolvedValue({ status: 201, data: { assetId: 0, versionId: 789012 } });
    await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', '1701'))
      .rejects.toThrow('PM DAM mapping response contains invalid IDs');
  });

  it('should reject invalid versionId in API response', async () => {
    mockPost.mockResolvedValue({ status: 201, data: { assetId: 123456, versionId: null } });
    await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', '1701'))
      .rejects.toThrow('PM DAM mapping response contains invalid IDs');
  });

  it('should reject missing PM base URL', async () => {
    const originalBaseUrl = config.APRIMO_PM_BASE_URL;
    try {
      config.APRIMO_PM_BASE_URL = '';
      await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', '1701'))
        .rejects.toThrow('APRIMO_PM_BASE_URL is not configured');
      expect(mockPost).not.toHaveBeenCalled();
    } finally {
      config.APRIMO_PM_BASE_URL = originalBaseUrl;
    }
  });

  it('should handle PM DAM mapping API failure', async () => {
    mockPost.mockRejectedValue(new Error('PM API request failed'));
    await expect(PmDigitalAssetService.createDamMapping('test-dam-record-id', '1701'))
      .rejects.toThrow('PM API request failed');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'PM DAM mapping creation failed',
    }));
  });

  it('should extract versionId from _embedded response', async () => {
    const responseData = Object.fromEntries([
      ['assetId', 357401],
      ['hasVersions', true],
      ['_embedded', [{ versionId: 365301, isDefaultVersion: true, digitalAssetId: 357401 }]],
    ]);
    mockPost.mockResolvedValue({ status: 200, data: responseData });
    const result = await PmDigitalAssetService.createDamMapping(
      '32988f58-3521-4c83-981d-b4f200827933', 1701
    );
    expect(result).toEqual({ assetId: 357401, versionId: 365301 });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should log successful mapping creation', async () => {
    mockPost.mockResolvedValue({ status: 201, data: { assetId: 123456, versionId: 789012 } });
    await PmDigitalAssetService.createDamMapping('test-dam-record-id', '1701');
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'PM DAM mapping created successfully',
      options: expect.objectContaining({ assetId: 123456, versionId: 789012, statusCode: 201 }),
    }));
  });

  it('should associate PM asset with project successfully', async () => {
    mockPut.mockResolvedValue({ status: 204, data: undefined });
    await expect(PmDigitalAssetService.associateAssetWithProject(12345, 357401))
      .resolves.toBeUndefined();
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      '/api/projects/12345/digital-assets/357401',
      undefined,
      expect.objectContaining({
        baseURL: config.APRIMO_PM_BASE_URL,
        headers: expect.objectContaining({ 'API-VERSION': '1', Accept: 'application/json' }),
      })
    );
    expect(mockPost).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'PM Project digital asset association completed successfully',
      options: expect.objectContaining({ projectId: 12345, assetId: 357401, statusCode: 204 }),
    }));
  });

  it('should reject invalid PM project ID', async () => {
    await expect(PmDigitalAssetService.associateAssetWithProject(0, 357401))
      .rejects.toThrow('Invalid PM project ID');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should reject invalid PM asset ID', async () => {
    await expect(PmDigitalAssetService.associateAssetWithProject(12345, -1))
      .rejects.toThrow('Invalid PM asset ID');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should handle PM project association API failure', async () => {
    mockPut.mockRejectedValue(new Error('PM association API failed'));
    await expect(PmDigitalAssetService.associateAssetWithProject(12345, 357401))
      .rejects.toThrow('PM association API failed');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'PM Project digital asset association failed',
      options: expect.objectContaining({ projectId: 12345, assetId: 357401 }),
    }));
  });
});
