import type { Request, Response } from 'express';

import logger from '../../../utils/logger';
import { FieldConcatenationService } from '../services/FieldConcatenationService';

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

  public static async processWebhook(
    req: Request,
    res: Response
  ): Promise<void> {
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

    const payload = FieldConcatenationController.parseObject(req.body);
    const webhookBody = payload
      ? FieldConcatenationController.parseObject(payload.Body)
      : null;

    if (!payload || !webhookBody) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid FCU webhook payload or Body',
      });
      return;
    }

    const taskId = FieldConcatenationController.parseId(payload.ObjectId);
    const projectId = FieldConcatenationController.parseId(
      webhookBody.project_id
    );

    if (projectId === null || taskId === null) {
      res.status(400).json({
        status: 'error',
        message: 'Valid ObjectId and Body.project_id are required',
      });
      return;
    }

    const environment = process.env.NODE_ENV || 'development';

    try {
      const result =
        await FieldConcatenationService.resolveProjectConfiguration(
          projectId,
          taskId,
          environment
        );

      logger.info({
        msg: 'Field Concatenation project configuration resolved',
        options: {
          projectId,
          taskId,
          extendedAttributeCount: result.extendedAttributeCount,
          inputFieldCount: result.config.inputConcatFields.length,
          outputFieldCount: result.config.output.length,
        },
      });

      res.status(200).json({
        status: 'project_configuration_resolved',
        stage: 'PROJECT_CONFIGURATION',
        processingCompleted: false,
        projectId,
        taskId,
        inputFieldCount: result.config.inputConcatFields.length,
        outputFieldCount: result.config.output.length,
        separator: result.config.separator,
      });
    } catch (error) {
      logger.error({
        msg: 'Field Concatenation project configuration failed',
        options: {
          projectId,
          taskId,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      res.status(500).json({
        status: 'error',
        message: 'Unable to resolve FCU project configuration',
      });
    }
  }
}
