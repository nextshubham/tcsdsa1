
import { Request, Response, NextFunction } from 'express';

import logger from '../utils/logger';
import { HmacValidator } from '../utils/hmacValidator';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export class HmacMiddleware {
  private readonly hmacValidator: HmacValidator;

  constructor(hmacValidator: HmacValidator = new HmacValidator()) {
    this.hmacValidator = hmacValidator;
  }

  public validate = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const xSh1Header = req.get('X-SH1');
    const webhookSecret = process.env.CREATE_DAM_RECORD_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error({
        msg: 'Create DAM Record webhook secret is not configured',
      });

      res.status(500).json({
        status: 'error',
        message: 'Webhook verification is not configured',
      });
      return;
    }

    if (!xSh1Header) {
      logger.warn({
        msg: 'Missing X-SH1 signature',
      });

      res.status(401).json({
        status: 'error',
        message: 'Missing X-SH1 signature',
      });
      return;
    }

    const rawRequestBody = (req as RawBodyRequest).rawBody;

    if (!rawRequestBody || !Buffer.isBuffer(rawRequestBody)) {
      logger.error({
        msg: 'Raw webhook request body is unavailable',
      });

      res.status(400).json({
        status: 'error',
        message: 'Invalid webhook request body',
      });
      return;
    }

    const isValidSignature = this.hmacValidator.isValidSh1(
      xSh1Header,
      rawRequestBody,
      webhookSecret
    );

    if (!isValidSignature) {
      logger.warn({
        msg: 'Invalid Create DAM Record webhook signature',
      });

      res.status(401).json({
        status: 'error',
        message: 'Invalid webhook signature',
      });
      return;
    }

    logger.info({
      msg: 'Create DAM Record webhook HMAC validated successfully',
    });

    next();
  };
}

export default new HmacMiddleware();
