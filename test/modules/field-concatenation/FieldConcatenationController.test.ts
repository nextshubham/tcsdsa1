import type { Request, Response } from 'express';

// eslint-disable-next-line max-len
import { FieldConcatenationController } from '../../../modules/field-concatenation/controllers/FieldConcatenationController';
import logger from '../../../utils/logger';

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FieldConcatenationController — Day 1 validation only', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalValidationOnly = process.env.FCU_VALIDATION_ONLY;

  const makeMocks = (body: unknown) => {
    const req = { body } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    return { req, res };
  };

  const validPayload = {
    ObjectId: 87701,
    Body: '{"project_id":1000,"status":"Approved"}',
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.FCU_VALIDATION_ONLY = 'true';
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalValidationOnly === undefined) {
      delete process.env.FCU_VALIDATION_ONLY;
    } else {
      process.env.FCU_VALIDATION_ONLY = originalValidationOnly;
    }
  });

  it('acknowledges valid IDs without claiming processing completed', () => {
    const { req, res } = makeMocks(validPayload);

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'accepted_for_validation',
      stage: 'VALIDATION_ONLY',
      processingCompleted: false,
      projectId: 1000,
      taskId: 87701,
    });
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'Field Concatenation webhook validated successfully',
      options: { projectId: 1000, taskId: 87701 },
    });
  });

  it('accepts string IDs and a nested Body object', () => {
    const { req, res } = makeMocks({
      ObjectId: '87701',
      Body: { project_id: '1000' },
    });

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 1000, taskId: 87701 })
    );
  });

  it('accepts a JSON-stringified top-level webhook payload', () => {
    const { req, res } = makeMocks(JSON.stringify(validPayload));

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([null, [], 'not-json', '[]'])(
    'rejects an invalid top-level payload: %p',
    (body) => {
      const { req, res } = makeMocks(body);

      FieldConcatenationController.processWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Invalid FCU webhook payload or Body',
      });
    }
  );

  it('rejects a malformed nested Body', () => {
    const { req, res } = makeMocks({
      ObjectId: 87701,
      Body: '{',
    });

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a missing project ID', () => {
    const { req, res } = makeMocks({ ObjectId: 87701, Body: '{}' });

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Valid ObjectId and Body.project_id are required',
    });
  });

  it('rejects a missing task ID', () => {
    const { req, res } = makeMocks({ Body: '{"project_id":1000}' });

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each([0, -1, 'abc', '12.5', 1.5])(
    'rejects an invalid task ID: %p',
    (taskId) => {
      const { req, res } = makeMocks({
        ObjectId: taskId,
        Body: '{"project_id":1000}',
      });

      FieldConcatenationController.processWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    }
  );

  it('rejects an unsafe project ID', () => {
    const { req, res } = makeMocks({
      ObjectId: 87701,
      Body: { project_id: '9007199254740993' },
    });

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('does not acknowledge processing outside development', () => {
    process.env.NODE_ENV = 'production';
    const { req, res } = makeMocks(validPayload);

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'not_ready',
      message: 'FCU processing is not yet enabled',
    });
  });

  it('does not acknowledge processing when validation-only is disabled', () => {
    process.env.FCU_VALIDATION_ONLY = 'false';
    const { req, res } = makeMocks(validPayload);

    FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});
