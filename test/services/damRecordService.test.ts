import httpClient from '../../services/httpClient';
import { DamRecordService } from '../../services/damRecordService';
import { logAprimoRequestError } from '../../utils/aprimoErrorLogger';
import type { DamRecordPayload } from '../../utils/damRecordPayloadBuilder';

jest.mock('../../services/httpClient', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock('../../constants/aprimo', () => ({ RECORD_HEADERS: { 'API-VERSION': '1' } }));
jest.mock('../../constants/httpAgent', () => ({ httpsAgent: {} }));
jest.mock('../../utils/aprimoErrorLogger', () => ({ logAprimoRequestError: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe('DamRecordService', () => {
  const mockPost = httpClient.post as jest.Mock;
  const payload: DamRecordPayload = {
    status: 'draft',
    contentType: 'MLR Approval Record',
    fields: {
      addOrUpdate: [{
        id: 'title-field',
        localizedValues: [{ languageId: 'en-US', value: 'PM Project Title' }],
      }],
    },
    classifications: { addOrUpdate: [{ id: 'class-id' }] },
  };

  beforeEach(() => { jest.clearAllMocks(); });

  it('creates a DAM record and returns the created record ID and status', async () => {
    mockPost.mockResolvedValueOnce({ status: 201, data: { recordID: 'new-dam-id' } });
    await expect(DamRecordService.createDamRecord(payload)).resolves.toEqual({
      recordId: 'new-dam-id', statusCode: 201,
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/api/core/records',
      payload,
      expect.objectContaining({ headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }) })
    );
  });

  it('rejects missing contentType without making an API request', async () => {
    await expect(DamRecordService.createDamRecord({ ...payload, contentType: '' }))
      .rejects.toThrow('DAM contentType is required');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects missing status without making an API request', async () => {
    await expect(DamRecordService.createDamRecord({ ...payload, status: '' }))
      .rejects.toThrow('DAM record status is required');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects an API response without a DAM record ID', async () => {
    mockPost.mockResolvedValueOnce({ status: 201, data: {} });
    await expect(DamRecordService.createDamRecord(payload))
      .rejects.toThrow('DAM Create Record API response does not contain record ID');
  });

  it('propagates and logs DAM API failures', async () => {
    const error = new Error('DAM API unavailable');
    mockPost.mockRejectedValueOnce(error);
    await expect(DamRecordService.createDamRecord(payload)).rejects.toThrow(
      'DAM API unavailable'
    );
    expect(logAprimoRequestError).toHaveBeenCalledWith(
      error,
      'Aprimo DAM Create Record API request failed'
    );
  });
});
