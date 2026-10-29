
import config from '../config/env';
import logger from '../utils/logger';
import httpClient from '../services/httpClient';
import { PmDigitalAssetService } from '../services/pmDigitalAssetService';

// Mock HTTP client to prevent real API calls
jest.mock('../services/httpClient', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

// Mock environment configuration
jest.mock('../config/env', () => ({
  __esModule: true,
  default: {
    APRIMO_PM_BASE_URL: 'https://pm.example.test',
    APRIMO_API_VERSION: '1',
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PmDigitalAssetService', () => {
  const mockPost = httpClient.post as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // Test 1: Successful mapping creation
  it('should create PM/DAM mapping successfully', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {
        assetId: 123456,
        versionId: 789012,
      },
    });

    const result =
      await PmDigitalAssetService.createDamMapping(
        '5cb9e131f8d44b6da0fe43d0ca22ab7',
        '1701'
      );

    expect(result).toEqual({
      assetId: 123456,
      versionId: 789012,
    });

    expect(mockPost).toHaveBeenCalledTimes(1);

    expect(mockPost).toHaveBeenCalledWith(
      '/digital-assets/dam-mapping',
      {
        damRecordId: '5cb9e131f8d44b6da0fe43d0ca22ab7',
        assetTypeId: 1701,
      },
      expect.objectContaining({
        baseURL: config.APRIMO_PM_BASE_URL,
        headers: expect.objectContaining({
          'API-VERSION': '1',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
      })
    );
  });

  // Test 2: Numeric asset type ID
  it('should accept numeric PM asset type ID', async () => {
    mockPost.mockResolvedValue({
      status: 200,
      data: {
        assetId: 123456,
        versionId: 789012,
      },
    });

    const result =
      await PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        1701
      );

    expect(result.assetId).toBe(123456);
    expect(result.versionId).toBe(789012);

    expect(mockPost).toHaveBeenCalledWith(
      '/digital-assets/dam-mapping',
      {
        damRecordId: 'test-dam-record-id',
        assetTypeId: 1701,
      },
      expect.any(Object)
    );
  });

  // Test 3: Missing DAM record ID
  it('should reject missing DAM record ID', async () => {
    await expect(
      PmDigitalAssetService.createDamMapping('', '1701')
    ).rejects.toThrow('DAM record ID is required');

    expect(mockPost).not.toHaveBeenCalled();
  });

  // Test 4: Invalid PM asset type ID
  it('should reject invalid PM asset type ID', async () => {
    await expect(
      PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        'invalid-id'
      )
    ).rejects.toThrow('Invalid PM asset type ID');

    expect(mockPost).not.toHaveBeenCalled();
  });

  // Test 5: Zero asset type ID
  it('should reject zero PM asset type ID', async () => {
    await expect(
      PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        0
      )
    ).rejects.toThrow('Invalid PM asset type ID');

    expect(mockPost).not.toHaveBeenCalled();
  });

  // Test 6: Invalid assetId in API response
  it('should reject invalid assetId in API response', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {
        assetId: 0,
        versionId: 789012,
      },
    });

    await expect(
      PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        '1701'
      )
    ).rejects.toThrow(
      'PM DAM mapping response contains invalid IDs'
    );
  });

  // Test 7: Invalid versionId in API response
  it('should reject invalid versionId in API response', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {
        assetId: 123456,
        versionId: null,
      },
    });

    await expect(
      PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        '1701'
      )
    ).rejects.toThrow(
      'PM DAM mapping response contains invalid IDs'
    );
  });

  // Test 8: Missing PM API base URL
  it('should reject missing PM base URL', async () => {
    const originalBaseUrl = config.APRIMO_PM_BASE_URL;

    try {
      config.APRIMO_PM_BASE_URL = '';

      await expect(
        PmDigitalAssetService.createDamMapping(
          'test-dam-record-id',
          '1701'
        )
      ).rejects.toThrow(
        'APRIMO_PM_BASE_URL is not configured'
      );

      expect(mockPost).not.toHaveBeenCalled();
    } finally {
      config.APRIMO_PM_BASE_URL = originalBaseUrl;
    }
  });

  // Test 9: PM API failure
  it('should handle PM DAM mapping API failure', async () => {
    mockPost.mockRejectedValue(
      new Error('PM API request failed')
    );

    await expect(
      PmDigitalAssetService.createDamMapping(
        'test-dam-record-id',
        '1701'
      )
    ).rejects.toThrow('PM API request failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'PM DAM mapping creation failed',
      })
    );
  });

  // Test 10: Verify successful logging
  it('should log successful mapping creation', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {
        assetId: 123456,
        versionId: 789012,
      },
    });

    await PmDigitalAssetService.createDamMapping(
      'test-dam-record-id',
      '1701'
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'PM DAM mapping created successfully',
        options: expect.objectContaining({
          assetId: 123456,
          versionId: 789012,
          statusCode: 201,
        }),
      })
    );
  });
});
