import type { Request, Response } from 'express';

import { FieldConcatenationController } from '../../../modules/field-concatenation/controllers/FieldConcatenationController';
import { FieldConcatenationService } from '../../../modules/field-concatenation/services/FieldConcatenationService';
import { FieldConcatReadOnlyService } from '../../../modules/field-concatenation/services/FieldConcatReadOnlyService';
import logger from '../../../utils/logger';

jest.mock('../../../modules/field-concatenation/services/FieldConcatenationService', () => ({
  FieldConcatenationService: { resolveProjectConfiguration: jest.fn() },
}));

jest.mock('../../../modules/field-concatenation/services/FieldConcatReadOnlyService', () => ({
  FieldConcatReadOnlyService: { preview: jest.fn() },
}));

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('FieldConcatenationController', () => {
  const resolveProjectConfiguration =
    FieldConcatenationService.resolveProjectConfiguration as jest.Mock;
  const previewFields = FieldConcatReadOnlyService.preview as jest.Mock;
  const infoLog = logger.info as jest.Mock;
  const warnLog = logger.warn as jest.Mock;
  const errorLog = logger.error as jest.Mock;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldValidationOnly = process.env.FCU_VALIDATION_ONLY;
  const oldDay3Preview = process.env.FCU_DAY3_PREVIEW;

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
    delete process.env.FCU_DAY3_PREVIEW;
  });

  afterAll(() => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };

    restore('NODE_ENV', oldNodeEnv);
    restore('FCU_VALIDATION_ONLY', oldValidationOnly);
    restore('FCU_DAY3_PREVIEW', oldDay3Preview);
  });

  it('logs webhook start and end with projectId correlation on success', async () => {
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
      EventId: 'test-event-1',
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
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request started',
      options: expect.objectContaining({
        correlationId: '1000',
        projectId: 1000,
        taskId: 87701,
        eventId: 'test-event-1',
      }),
    });
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({
        correlationId: '1000',
        statusCode: 200,
        outcome: 'PROJECT_CONFIGURATION_RESOLVED',
        processingCompleted: false,
        durationMs: expect.any(Number),
      }),
    });
  });

  it('logs the end even when the webhook payload is invalid', async () => {
    const { req, res } = createMocks({ ObjectId: 87701, Body: '{}' });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith({
      msg: 'FCU webhook ID validation failed',
      options: expect.objectContaining({ taskId: 87701 }),
    });
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({ statusCode: 400, outcome: 'INVALID_IDS' }),
    });
  });

  it('rejects a malformed Body and logs the request outcome', async () => {
    const { req, res } = createMocks({ ObjectId: 87701, Body: '{bad-json' });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({ statusCode: 400, outcome: 'INVALID_PAYLOAD' }),
    });
  });

  it('rejects a missing task ID before making an API call', async () => {
    const { req, res } = createMocks({ Body: { project_id: 1000 } });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({ correlationId: '1000', statusCode: 400 }),
    });
  });

  it('logs the end when the unfinished workflow is disabled', async () => {
    process.env.NODE_ENV = 'production';
    const { req, res } = createMocks({
      ObjectId: 87701,
      Body: { project_id: 1000 },
    });

    await FieldConcatenationController.processWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({
        correlationId: '1000',
        statusCode: 503,
        outcome: 'NOT_READY',
      }),
    });
  });

  it('returns read-only preview with the same correlation ID', async () => {
    process.env.FCU_DAY3_PREVIEW = 'true';
    previewFields.mockResolvedValue({
      projectId: 1000,
      taskId: 87701,
      activityId: 500,
      separator: '_',
      inputFieldCount: 1,
      outputFieldCount: 1,
      processingCompleted: false,
      fields: [{
        fieldId: 'GLOBAL', fieldName: '', dataType: 'Text',
        objectType: 'Constant', operation: 'NA', status: 'CONSTANT',
        rawValue: 'GLOBAL', pendingSteps: [],
      }],
    });
    const { req, res } = createMocks({
      ObjectId: 87701,
      EventId: 'event-readonly',
      Body: '{"project_id":1000}',
    });

    await FieldConcatenationController.processWebhook(req, res);

    expect(previewFields).toHaveBeenCalledWith(1000, 87701, 'development');
    expect(resolveProjectConfiguration).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'field_values_preview',
      stage: 'FIELD_VALUES_PREVIEW',
      processingCompleted: false,
      inputFieldCount: 1,
    }));
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({
        correlationId: '1000',
        outcome: 'FIELD_VALUES_PREVIEW_READY',
        statusCode: 200,
      }),
    });
  });

  it('logs failure and end when PM retrieval fails', async () => {
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
    expect(errorLog).toHaveBeenCalledWith({
      msg: 'FCU webhook processing failed',
      options: expect.objectContaining({
        correlationId: '1000',
        projectId: 1000,
        taskId: 87701,
        error: 'PM unavailable',
      }),
    });
    expect(infoLog).toHaveBeenCalledWith({
      msg: 'FCU webhook request ended',
      options: expect.objectContaining({ statusCode: 500, outcome: 'FAILED' }),
    });
  });
});
