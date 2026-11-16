import type { NextFunction, Request, Response } from 'express';

import { CreateDamRecordController } from '../../../../modules/create-dam-record/controllers/CreateDamRecordController';
import { CreateDamRecordService } from '../../../../modules/create-dam-record/services/CreateDamRecordService';

jest.mock(
  '../../../../modules/create-dam-record/services/CreateDamRecordService',
  () => ({
    CreateDamRecordService: {
      resolveProjectInputParameters: jest.fn(),
    },
  })
);

jest.mock('../../../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CreateDamRecordController', () => {
  const resolveProjectInputParameters =
    CreateDamRecordService.resolveProjectInputParameters as jest.Mock;

  const requestResponse = (body: unknown) => {
    const req = {
      body,
      method: 'POST',
      originalUrl: '/api/v1/webhook/create-dam-record',
    } as Request;

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
      data: {
        DamFieldList: { items: [] },
        PMFieldList: { items: [] },
      },
    });
  });

  describe('Valid webhook requests', () => {
    it('processes a valid webhook and calls the PM project service', async () => {
      const { req, res, next } = requestResponse({
        env: 'development',
        environment: 'development',
        ObjectId: 77,
        Body: { project_id: 42 },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).toHaveBeenCalledTimes(1);
      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
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

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts valid numeric string IDs', async () => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: '77',
        Body: { project_id: '42' },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      // The controller passes three arguments; the fourth one is optional.
      expect(resolveProjectInputParameters).toHaveBeenCalledTimes(1);
      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts numeric string IDs with whitespace', async () => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: ' 77 ',
        Body: { project_id: ' 42 ' },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('supports projectId when project_id is missing', async () => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: 77,
        Body: { projectId: 42 },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('processes a webhook supplied as a JSON string', async () => {
      const { req, res, next } = requestResponse(
        JSON.stringify({ ObjectId: 77, Body: { project_id: 42 } })
      );

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('parses a doubly encoded JSON Body', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: JSON.stringify(JSON.stringify({ project_id: 42 })),
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('reads project_id from the top-level payload when Body is absent', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        project_id: 42,
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts the maximum safe integer ID', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: '77',
        Body: { project_id: String(Number.MAX_SAFE_INTEGER) },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([Number.MAX_SAFE_INTEGER, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Legacy Aprimo webhook Body handling', () => {
    it('accepts a legacy Body with unquoted property names', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: '2343330',
        Body: '{project_id:285301,step_CalloutType:9,status:"Approved",test_mode:1}',
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).toHaveBeenCalledTimes(1);
      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([285301, 2343330, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts project_id in the middle of a legacy Body', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: '{status:"Approved",project_id:42,test_mode:1}',
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts a legacy Body with whitespace around project_id', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: '  { project_id : 42 }  ',
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts a case-insensitive legacy project_id key', async () => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: '{PROJECT_ID:42,test_mode:1}',
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it.each([
      ['missing project_id', '{status:"Approved",test_mode:1}'],
      ['nonnumeric project_id', '{project_id:abc,status:"Approved"}'],
      ['zero project_id', '{project_id:0,status:"Approved"}'],
      ['negative project_id', '{project_id:-1,status:"Approved"}'],
      ['decimal project_id', '{project_id:42.5,status:"Approved"}'],
      ['unsafe project_id', '{project_id:9007199254740992}'],
      ['missing opening brace', 'project_id:42}'],
      ['missing closing brace', '{project_id:42'],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['unrelated text', '{status:"Approved"}'],
      ['quoted project_id in malformed JSON', '{"project_id":42,status:"Approved"}'],
    ])('rejects a legacy Body with %s', async (_description, body) => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: body,
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Invalid webhook payload and Body', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['array', []],
      ['boolean', true],
      ['number', 42],
      ['malformed JSON', '{not valid JSON'],
      ['JSON array', JSON.stringify([1, 2])],
      ['JSON number', '42'],
    ])('rejects a top-level %s payload', async (_description, body) => {
      const { req, res, next } = requestResponse(body);

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it.each([
      ['number', 42],
      ['boolean', false],
      ['array', [42]],
      ['invalid JSON string', '{invalid}'],
      ['JSON array string', '[1,2]'],
      ['JSON null string', 'null'],
      ['empty object', {}],
    ])('rejects an invalid nested Body: %s', async (_description, body) => {
      const { req, res, next } = requestResponse({
        ObjectId: 77,
        Body: body,
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Invalid Project ID validation', () => {
    it.each([
      ['boolean true', true],
      ['boolean false', false],
      ['array containing number', [42]],
      ['empty array', []],
      ['object', { id: 42 }],
      ['zero', 0],
      ['zero string', '0'],
      ['negative number', -5],
      ['negative string', '-5'],
      ['decimal number', 12.5],
      ['decimal string', '12.5'],
      ['invalid string', 'not-a-number'],
      ['empty string', ''],
      ['whitespace string', '   '],
      ['null', null],
      ['undefined', undefined],
      ['unsafe number', Number.MAX_SAFE_INTEGER + 1],
      ['unsafe string', '9007199254740992'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['scientific notation', '1e3'],
      ['hexadecimal string', '0x2A'],
    ])('rejects project ID: %s', async (_description, value) => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: 77,
        Body: { project_id: value },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Invalid Task ID validation', () => {
    it.each([
      ['boolean true', true],
      ['boolean false', false],
      ['array containing number', [77]],
      ['empty array', []],
      ['object', { id: 77 }],
      ['zero', 0],
      ['zero string', '0'],
      ['negative number', -5],
      ['negative string', '-5'],
      ['decimal number', 12.5],
      ['decimal string', '12.5'],
      ['invalid string', 'invalid-task'],
      ['empty string', ''],
      ['whitespace string', '   '],
      ['null', null],
      ['undefined', undefined],
      ['unsafe number', Number.MAX_SAFE_INTEGER + 1],
      ['unsafe string', '9007199254740992'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['scientific notation', '1e3'],
      ['hexadecimal string', '0x4D'],
    ])('rejects Task/ObjectId: %s', async (_description, value) => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: value,
        Body: { project_id: 42 },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(resolveProjectInputParameters).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Service error handling', () => {
    it('forwards a service failure to Express next(error)', async () => {
      const error = new Error('PM project API unavailable');
      resolveProjectInputParameters.mockRejectedValueOnce(error);

      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: 77,
        Body: { project_id: 42 },
      });

      await CreateDamRecordController.processWebhook(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalledWith(200);
    });
  });
});
