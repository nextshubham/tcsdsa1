
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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

      expect(resolveProjectInputParameters).toHaveBeenCalledWith(
        42,
        77,
        expect.any(String),
        expect.anything()
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts numeric string IDs with whitespace', async () => {
      const { req, res, next } = requestResponse({
        env: 'development',
        ObjectId: ' 77 ',
        Body: { project_id: ' 42 ' },
      });

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

      expect(
        resolveProjectInputParameters.mock.calls[0].slice(0, 3)
      ).toEqual([42, 77, expect.any(String)]);

      expect(res.status).toHaveBeenCalledWith(200);
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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

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

      await CreateDamRecordController.processWebhook(
        req,
        res,
        next
      );

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalledWith(200);
    });
  });
});
