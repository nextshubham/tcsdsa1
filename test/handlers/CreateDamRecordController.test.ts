import type { NextFunction, Request, Response } from 'express';
import { CreateDamRecordController } from '../../handlers/CreateDamRecordController';
import { CreateDamRecordService } from '../../services/CreateDamRecordService';

jest.mock('../../services/CreateDamRecordService', () => ({
  CreateDamRecordService: { resolveProjectInputParameters: jest.fn() },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('CreateDamRecordController', () => {
  const resolveProjectInputParameters =
    CreateDamRecordService.resolveProjectInputParameters as jest.Mock;

  const requestResponse = (body: unknown) => {
    const req = { body } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    return { req, res, next };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveProjectInputParameters.mockResolvedValue({
      format: 'FIELD_MAPPING',
      data: { DamFieldList: { items: [] }, PMFieldList: { items: [] } },
    });
  });

  it('processes a valid webhook and calls the PM project service', async () => {
    const { req, res, next } = requestResponse({
      env: 'development',
      environment: 'development',
      ObjectId: 77,
      Body: { project_id: 42 },
    });
    await CreateDamRecordController.processWebhook(req, res, next);
    expect(resolveProjectInputParameters).toHaveBeenCalledTimes(1);
    expect(resolveProjectInputParameters.mock.calls[0].slice(0, 3)).toEqual([
      42,
      77,
      expect.any(String),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('processes Body supplied as a JSON string', async () => {
    const { req, res, next } = requestResponse({
      env: 'development',
      ObjectId: 77,
      Body: JSON.stringify({ project_id: 42 }),
    });
    await CreateDamRecordController.processWebhook(req, res, next);
    expect(resolveProjectInputParameters.mock.calls[0].slice(0, 3)).toEqual([
      42,
      77,
      expect.any(String),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects an invalid project ID without calling the PM service', async () => {
    const { req, res, next } = requestResponse({
      env: 'development', ObjectId: 77, Body: { project_id: 'not-a-number' },
    });
    await CreateDamRecordController.processWebhook(req, res, next);
    expect(resolveProjectInputParameters).not.toHaveBeenCalled();
    // The current controller responds with 400 for bad input; verify no success response.
    expect(res.status).not.toHaveBeenCalledWith(200);
    expect((res.status as jest.Mock).mock.calls.length + next.mock.calls.length)
      .toBeGreaterThan(0);
  });

  it('rejects an invalid task/ObjectId without starting processing', async () => {
    const { req, res, next } = requestResponse({
      env: 'development', ObjectId: 0, Body: { project_id: 42 },
    });
    await CreateDamRecordController.processWebhook(req, res, next);
    expect(resolveProjectInputParameters).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  it('forwards a service failure to Express next(error)', async () => {
    const error = new Error('PM project API unavailable');
    resolveProjectInputParameters.mockRejectedValueOnce(error);
    const { req, res, next } = requestResponse({
      env: 'development', ObjectId: 77, Body: { project_id: 42 },
    });
    await CreateDamRecordController.processWebhook(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalledWith(200);
  });
});
