import { PmProjectService } from './pmProjectService';
import type { PmProjectDetails } from '../models/pmClassification';

export class CreateDamRecordService {
  public static async getProjectDetails(
    projectId: number,
    environment: string
  ): Promise<PmProjectDetails> {
    const projectDetails = await PmProjectService.getProjectDetails(
      projectId,
      environment
    );

    return projectDetails;
  }
}
