import { createHmac } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { HmacMiddleware } from '../../middlewares/hmacMiddleware';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('HmacMiddleware', () => {
  const originalSecret = process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET;
  const middleware = new HmacMiddleware();
  const rawBody = Buffer.from('{"Body":{"project_id":42}}');

  const sign = (body: Buffer): string =>
    createHmac('sha256', 'middleware-test-secret').update(body).digest('base64');

  const makeMocks = (signature?: string, body?: Buffer) => {
    const request = {
      get: jest.fn((name: string) => (name.toLowerCase() === 'x-sh1' ? signature : undefined)),
      rawBody: body,
    } as unknown as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const next = jest.fn() as jest.MockedFunction<NextFunction>;
    return { request, response, next };
  };

  beforeEach(() => {
    process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET = 'middleware-test-secret';
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET;
    } else {
      process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('calls next when the header signs the exact raw request body', () => {
    const { request, response, next } = makeMocks(sign(rawBody), rawBody);
    middleware.validate(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns 500 and does not call next when the secret is not configured', () => {
    delete process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET;
    const { request, response, next } = makeMocks(sign(rawBody), rawBody);
    middleware.validate(request, response, next);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when X-SH1 is missing', () => {
    const { request, response, next } = makeMocks(undefined, rawBody);
    middleware.validate(request, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when the raw request body was not captured', () => {
    const { request, response, next } = makeMocks(sign(rawBody));
    middleware.validate(request, response, next);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid HMAC signature', () => {
    const { request, response, next } = makeMocks(sign(Buffer.from('different')), rawBody);
    middleware.validate(request, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if a signed body changes after signing', () => {
    const { request, response, next } = makeMocks(sign(rawBody), Buffer.from('{}'));
    middleware.validate(request, response, next);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
