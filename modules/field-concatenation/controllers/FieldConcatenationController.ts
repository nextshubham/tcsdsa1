import type { Request, Response } from 'express';

import logger from '../../../utils/logger';

type WebhookObject = Record<string, unknown>;

export class FieldConcatenationController {
  private static parseObject(value: unknown): WebhookObject | null {
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return FieldConcatenationController.parseObject(parsed);
      } catch {
        return null;
      }
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value as WebhookObject;
    }

    return null;
  }

  private static parseId(value: unknown): number | null {
    if (
      typeof value !== 'number' &&
      (typeof value !== 'string' || !/^\d+$/.test(value))
    ) {
      return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  public static processWebhook(req: Request, res: Response): void {
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.FCU_VALIDATION_ONLY !== 'true'
    ) {
      res.status(503).json({
        status: 'not_ready',
        message: 'FCU processing is not yet enabled',
      });
      return;
    }

    logger.info({
      msg: 'Field Concatenation webhook received',
    });

    const payload = FieldConcatenationController.parseObject(req.body);

    if (!payload) {
      logger.warn({
        msg: 'Invalid Field Concatenation webhook payload',
      });
      res.status(400).json({
        status: 'error',
        message: 'Invalid FCU webhook payload or Body',
      });
      return;
    }

    const webhookBody = FieldConcatenationController.parseObject(
      payload.Body
    );

    if (!webhookBody) {
      logger.warn({
        msg: 'Invalid Field Concatenation webhook Body',
      });
      res.status(400).json({
        status: 'error',
        message: 'Invalid FCU webhook payload or Body',
      });
      return;
    }

    const taskId = FieldConcatenationController.parseId(
      payload.ObjectId
    );
    const projectId = FieldConcatenationController.parseId(
      webhookBody.project_id
    );

    if (projectId === null || taskId === null) {
      logger.warn({
        msg: 'Invalid Field Concatenation project ID or task ID',
      });
      res.status(400).json({
        status: 'error',
        message: 'Valid ObjectId and Body.project_id are required',
      });
      return;
    }

    logger.info({
      msg: 'Field Concatenation webhook validated successfully',
      options: { projectId, taskId },
    });

    // Acknowledges only the Day 1 validation checkpoint, not FCU processing.
    res.status(200).json({
      status: 'accepted_for_validation',
      stage: 'VALIDATION_ONLY',
      processingCompleted: false,
      projectId,
      taskId,
    });
  }
}
