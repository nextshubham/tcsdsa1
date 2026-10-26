import { CreateDamRecordController } from './controllers/CreateDamRecordController';
app.post(
  '/api/v1/webhook/create-dam-record',
  authMiddleware,
  CreateDamRecordController.processWebhook
);

import { Request, Response } from 'express';

import logger from '../utils/logger';

export class CreateDamRecordController {
  public static processWebhook(_req: Request, res: Response): void {
    logger.info({
      msg: 'Create DAM Record Utility webhook received',
    });

    res.status(200).json({
      status: 'success',
      message: 'Create DAM Record Utility controller is working',
    });
  }
}
