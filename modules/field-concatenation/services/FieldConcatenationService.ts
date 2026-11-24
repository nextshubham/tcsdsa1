import { PmProjectService } from '../../../services/pmProjectService';
import { FieldConcatConfigParser } from '../parsers/FieldConcatConfigParser';
import type { FieldConcatInfo } from '../models/FieldConcatInfo';

export interface FieldConcatProjectConfiguration {
  projectId: number;
  taskId: number;
  extendedAttributeCount: number;
  config: FieldConcatInfo;
}

export class FieldConcatenationService {
  public static async resolveProjectConfiguration(
    projectId: number,
    taskId: number,
    environment: string
  ): Promise<FieldConcatProjectConfiguration> {
    const inputEaId = process.env.INPUT_PARAMETER_EA_ID?.trim();
    const outputEaId = process.env.OUTPUT_PARAMETER_EA_ID?.trim();

    if (!inputEaId) {
      throw new Error('INPUT_PARAMETER_EA_ID is not configured');
    }

    const projectDetails = await PmProjectService.getProjectDetails(
      projectId,
      environment
    );
    const { extendedAttributes } = projectDetails;

    if (!Array.isArray(extendedAttributes)) {
      throw new Error('PM project extendedAttributes are unavailable');
    }

    const config = FieldConcatConfigParser.resolve(
      extendedAttributes,
      inputEaId,
      outputEaId
    );

    return {
      projectId,
      taskId,
      extendedAttributeCount: extendedAttributes.length,
      config,
    };
  }
}
