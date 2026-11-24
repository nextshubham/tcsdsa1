import type { Request, Response } from 'express';

import { FieldConcatenationController } from '../../../modules/field-concatenation/controllers/FieldConcatenationController';
import { FieldConcatenationService } from '../../../modules/field-concatenation/services/FieldConcatenationService';

jest.mock('../../../modules/field-concatenation/services/FieldConcatenationService', () => ({
  FieldConcatenationService: { resolveProjectConfiguration: jest.fn() },
}));

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('FieldConcatenationController', () => {
  const resolveProjectConfiguration =
    FieldConcatenationService.resolveProjectConfiguration as jest.Mock;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldValidationOnly = process.env.FCU_VALIDATION_ONLY;

  const createMocks = (body: unknown) => {
    const req = { body } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    return { req, res };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.FCU_VALIDATION_ONLY = 'true';
  });

  afterAll(() => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };

    restore('NODE_ENV', oldNodeEnv);
    restore('FCU_VALIDATION_ONLY', oldValidationOnly);
  });

  it('returns counts after successfully resolving project configuration', async () => {
    resolveProjectConfiguration.mockResolvedValue({
      extendedAttributeCount: 3,
      config: {
        separator: '-',
        inputConcatFields: [{ fieldId: '12' }],
        output: [{ fieldId: '22' }],
      },
    });
    const { req, res } = createMocks({
      ObjectId: 87701,
      Body: '{"project_id":1000}',
    });

    await FieldConcatenationController.processWebhook(req, res);

    expect(resolveProjectConfiguration).toHaveBeenCalledWith(1000, 87701, 'development');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'project_configuration_resolved',
      stage: 'PROJECT_CONFIGURATION',
      processingCompleted: false,
      projectId: 1000,
      taskId: 87701,
      inputFieldCount: 1,
      outputFieldCount: 1,
      separator: '-',
    });
  });

  it('rejects an invalid webhook payload', async () => {
    const { req, res } = createMocks({ ObjectId: 87701, Body: '{}' });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
  });

  it('rejects a missing task ID before making an API call', async () => {
    const { req, res } = createMocks({ Body: { project_id: 1000 } });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
  });

  it('blocks the unfinished workflow outside development', async () => {
    process.env.NODE_ENV = 'production';
    const { req, res } = createMocks({
      ObjectId: 87701,
      Body: { project_id: 1000 },
    });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
  });

  it('does not claim success when PM retrieval fails', async () => {
    resolveProjectConfiguration.mockRejectedValue(new Error('PM unavailable'));
    const { req, res } = createMocks({
      ObjectId: 87701,
      Body: { project_id: 1000 },
    });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Unable to resolve FCU project configuration',
    });
  });
});
