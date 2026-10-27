
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { CreateDamRecordService } from '../services/CreateDamRecordService';

type WebhookObject = Record<string, unknown>;

export class CreateDamRecordController {
  private static parseObject(value: unknown): WebhookObject | null {
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return CreateDamRecordController.parseObject(parsed);
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

  private static isValidId(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  public static async processWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const payload = CreateDamRecordController.parseObject(req.body);

    if (!payload) {
      res.status(400).json({
        message: 'Invalid webhook payload',
      });
      return;
    }

    const body = CreateDamRecordController.parseObject(
      payload.Body ?? payload
    );

    if (!body) {
      res.status(400).json({
        message: 'Invalid webhook Body',
      });
      return;
    }

    const projectId = Number(
      body.project_id ?? body.projectId
    );

    const taskId = Number(payload.ObjectId);

    if (!CreateDamRecordController.isValidId(projectId)) {
      res.status(400).json({
        message: 'Invalid or missing projectId',
      });
      return;
    }

    if (!CreateDamRecordController.isValidId(taskId)) {
      res.status(400).json({
        message: 'Invalid or missing taskId',
      });
      return;
    }

    logger.info(
      {
        projectId,
        taskId,
        eventId: payload.EventId,
      },
      'Create DAM Record webhook payload validated'
    );

    try {
      const environment = process.env.NODE_ENV || 'development';

      await CreateDamRecordService.resolveProjectInputParameters(
        projectId,
        taskId,
        environment
      );

      logger.info(
        {
          projectId,
          taskId,
          environment,
        },
        'PM Project InputParameters processing completed'
      );

      res.status(200).json({
        message: 'PM Project InputParameters resolved successfully',
        projectId,
        taskId,
      });
    } catch (error) {
      next(error);
    }
  }
}
