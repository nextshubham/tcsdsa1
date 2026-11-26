import { PmActivityService } from '../../../services/pmActivityService';
import { PmTaskService } from '../../../services/pmTaskService';
import { FieldConcatenationService } from '../../../modules/field-concatenation/services/FieldConcatenationService';
import { FieldConcatReadOnlyService } from '../../../modules/field-concatenation/services/FieldConcatReadOnlyService';
import logger from '../../../utils/logger';

jest.mock('../../../services/pmActivityService', () => ({
  PmActivityService: { getActivityDetails: jest.fn() },
}));
jest.mock('../../../services/pmTaskService', () => ({
  PmTaskService: { getTaskDetails: jest.fn() },
}));
jest.mock('../../../modules/field-concatenation/services/FieldConcatenationService', () => ({
  FieldConcatenationService: { resolveProjectConfiguration: jest.fn() },
}));
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('FieldConcatReadOnlyService', () => {
  const resolveProjectConfiguration = FieldConcatenationService.resolveProjectConfiguration as jest.Mock;
  const getTaskDetails = PmTaskService.getTaskDetails as jest.Mock;
  const getActivityDetails = PmActivityService.getActivityDetails as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveProjectConfiguration.mockResolvedValue({
      config: {
        separator: '_',
        inputConcatFields: [
          { fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA', objectType: 'Activity', fieldLogic: 'UseMappingSheet' },
          { fieldId: 'GLOBAL', fieldName: '', dataType: 'Text', objectType: 'Constant', fieldLogic: 'NA' },
        ],
        output: [{ fieldId: '20', dataType: 'TextEA', objectType: 'Project' }],
      },
      projectDetails: { activityId: 300, extendedAttributes: [] },
    });
    getTaskDetails.mockResolvedValue({ activityId: 300 });
    getActivityDetails.mockResolvedValue({
      extendedAttributes: [{ eaId: 20401, eaValue: '900' }],
    });
  });

  it('retrieves task and activity exactly once, then returns a read-only preview', async () => {
    const result = await FieldConcatReadOnlyService.preview(1000, 87701, 'development');
    expect(resolveProjectConfiguration).toHaveBeenCalledTimes(1);
    expect(getTaskDetails).toHaveBeenCalledWith(87701, 'development', '1000');
    expect(getActivityDetails).toHaveBeenCalledWith(300, 'development');
    expect(result.processingCompleted).toBe(false);
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].status).toBe('PENDING_WEB_REPORT');
    expect(result.fields[1].rawValue).toBe('GLOBAL');
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'FCU read-only field preview ended',
      options: expect.objectContaining({
        correlationId: '1000', outcome: 'PREVIEW_READY',
      }),
    });
  });

  it('skips Activity API when configuration does not use Activity', async () => {
    resolveProjectConfiguration.mockResolvedValue({
      config: {
        separator: '-',
        inputConcatFields: [{ fieldId: 'GLOBAL', fieldName: '', dataType: 'NA', objectType: 'Constant', fieldLogic: '' }],
        output: [{ fieldId: '20', dataType: 'TextEA', objectType: 'Project' }],
      },
      projectDetails: { extendedAttributes: [] },
    });
    const result = await FieldConcatReadOnlyService.preview(1000, 87701, 'development');
    expect(getActivityDetails).not.toHaveBeenCalled();
    expect(result.activityId).toBeUndefined();
  });

  it('fails clearly if activity is required but the IDs cannot be identified', async () => {
    resolveProjectConfiguration.mockResolvedValue({
      config: {
        separator: '_',
        inputConcatFields: [{ fieldId: '1', fieldName: '', dataType: 'TextEA', objectType: 'Activity', fieldLogic: '' }],
        output: [],
      },
      projectDetails: { extendedAttributes: [] },
    });
    getTaskDetails.mockResolvedValue({});
    await expect(
      FieldConcatReadOnlyService.preview(1000, 87701, 'development')
    ).rejects.toThrow(/Activity ID not found/);
    expect(getActivityDetails).not.toHaveBeenCalled();
  });
});
