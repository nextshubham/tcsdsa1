import type { Request, Response } from 'express';

import logger from '../../../utils/logger';
import { FieldConcatenationService } from '../services/FieldConcatenationService';
import { FieldConcatReadOnlyService } from '../services/FieldConcatReadOnlyService';
import { FieldConcatProcessingService } from '../services/FieldConcatProcessingService';

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
    const startedAt = Date.now();
    const payload = FieldConcatenationController.parseObject(req.body);
    const webhookBody = payload
      ? FieldConcatenationController.parseObject(payload.Body)
      : null;
    const taskId = payload
      ? FieldConcatenationController.parseId(payload.ObjectId)
      : null;
    const projectId = webhookBody
      ? FieldConcatenationController.parseId(webhookBody.project_id)
      : null;
    const correlationId = projectId === null ? undefined : String(projectId);
    const eventId = typeof payload?.EventId === 'string'
      ? payload.EventId
      : undefined;
    const concatenationPreviewEnabled = process.env.FCU_DAY4_PREVIEW === 'true';
    const previewEnabled = process.env.FCU_DAY3_PREVIEW === 'true';
    const stage = concatenationPreviewEnabled
      ? 'CONCATENATION_PREVIEW'
      : previewEnabled ? 'FIELD_VALUES_PREVIEW' : 'PROJECT_CONFIGURATION';
    const context = {
      correlationId,
      projectId: projectId ?? undefined,
      taskId: taskId ?? undefined,
      eventId,
      stage,
    };

    let statusCode = 500;
    let outcome = 'FAILED';

    logger.info({
      msg: 'FCU webhook request started',
      options: context,
    });

    try {
      if (
        process.env.NODE_ENV !== 'development' ||
        process.env.FCU_VALIDATION_ONLY !== 'true'
      ) {
        statusCode = 503;
        outcome = 'NOT_READY';
        logger.warn({
          msg: 'FCU webhook processing is not enabled',
          options: context,
        });
        res.status(503).json({
          status: 'not_ready',
          message: 'FCU processing is not yet enabled',
        });
        return;
      }

      if (!payload || !webhookBody) {
        statusCode = 400;
        outcome = 'INVALID_PAYLOAD';
        logger.warn({
          msg: 'FCU webhook payload validation failed',
          options: { ...context, reason: 'Invalid payload or Body' },
        });
        res.status(400).json({
          status: 'error',
          message: 'Invalid FCU webhook payload or Body',
        });
        return;
      }

      if (projectId === null || taskId === null) {
        statusCode = 400;
        outcome = 'INVALID_IDS';
        logger.warn({
          msg: 'FCU webhook ID validation failed',
          options: { ...context, reason: 'Invalid projectId or taskId' },
        });
        res.status(400).json({
          status: 'error',
          message: 'Valid ObjectId and Body.project_id are required',
        });
        return;
      }

      const environment = process.env.NODE_ENV || 'development';
      if (concatenationPreviewEnabled) {
        const preview = await FieldConcatProcessingService.preview(
          projectId, taskId, environment
        );
        statusCode = 200;
        outcome = preview.readyForConcatenation
          ? 'CONCATENATION_PREVIEW_READY'
          : 'CONCATENATION_PREVIEW_INCOMPLETE';
        res.status(200).json({
          status: 'concatenation_preview',
          stage: 'CONCATENATION_PREVIEW',
          ...preview,
        });
        return;
      }
      if (previewEnabled) {
        const preview = await FieldConcatReadOnlyService.preview(
          projectId, taskId, environment
        );
        statusCode = 200;
        outcome = 'FIELD_VALUES_PREVIEW_READY';
        res.status(200).json({
          status: 'field_values_preview',
          stage: 'FIELD_VALUES_PREVIEW',
          ...preview,
        });
        return;
      }

      const result =
        await FieldConcatenationService.resolveProjectConfiguration(
          projectId,
          taskId,
          environment
        );

      logger.info({
        msg: 'FCU project configuration resolved',
        options: {
          ...context,
          extendedAttributeCount: result.extendedAttributeCount,
          inputFieldCount: result.config.inputConcatFields.length,
          outputFieldCount: result.config.output.length,
        },
      });

      statusCode = 200;
      outcome = 'PROJECT_CONFIGURATION_RESOLVED';
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
      statusCode = 500;
      outcome = 'FAILED';
      logger.error({
        msg: 'FCU webhook processing failed',
        options: {
          ...context,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      res.status(500).json({
        status: 'error',
        message: concatenationPreviewEnabled
          ? 'Unable to complete FCU concatenation preview'
          : previewEnabled
            ? 'Unable to complete FCU read-only preview'
            : 'Unable to resolve FCU project configuration',
      });
    } finally {
      logger.info({
        msg: 'FCU webhook request ended',
        options: {
          ...context,
          statusCode,
          outcome,
          processingCompleted: false,
          durationMs: Date.now() - startedAt,
        },
      });
    }
  }
}
