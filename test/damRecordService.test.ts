
import type { DamRecordPayload } from '../utils/damRecordPayloadBuilder';
import { DamRecordService } from '../services/damRecordService';
import httpClient from '../services/httpClient';

jest.mock('../services/httpClient', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('../constants/httpAgent', () => ({
  httpsAgent: undefined,
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../utils/aprimoErrorLogger', () => ({
  logAprimoRequestError: jest.fn(),
}));

describe('DamRecordService', () => {
  const mockPost = httpClient.post as jest.Mock;

  const payload: DamRecordPayload = {
    status: 'draft',
    contentType: 'MLR Approval Record',
    fields: {
      addOrUpdate: [
        {
          id: 'test-field-id',
          localizedValues: [
            {
              languageId: 'test-language-id',
              value: 'Test PM Project',
            },
          ],
        },
      ],
    },
    classifications: {
      addOrUpdate: [
        {
          id: 'test-classification-id',
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a DAM record successfully', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {
        recordID: 'test-record-123',
      },
    });

    const result = await DamRecordService.createDamRecord(
      payload
    );

    expect(result.recordId).toBe('test-record-123');
    expect(result.statusCode).toBe(201);

    expect(mockPost).toHaveBeenCalledWith(
      '/api/core/records',
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should reject missing contentType', async () => {
    const invalidPayload = {
      ...payload,
      contentType: '',
    };

    await expect(
      DamRecordService.createDamRecord(invalidPayload)
    ).rejects.toThrow('DAM contentType is required');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should reject missing status', async () => {
    const invalidPayload = {
      ...payload,
      status: '',
    };

    await expect(
      DamRecordService.createDamRecord(invalidPayload)
    ).rejects.toThrow('DAM record status is required');

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should reject a response without record ID', async () => {
    mockPost.mockResolvedValue({
      status: 201,
      data: {},
    });

    await expect(
      DamRecordService.createDamRecord(payload)
    ).rejects.toThrow(
      'DAM Create Record API response does not contain record ID'
    );
  });

  it('should handle an API failure', async () => {
    mockPost.mockRejectedValue(
      new Error('DAM API request failed')
    );

    await expect(
      DamRecordService.createDamRecord(payload)
    ).rejects.toThrow('DAM API request failed');
  });
});
