import logger from '../../../utils/logger';
import {
  FieldConcatReadOnlyService,
} from '../../../modules/field-concatenation/services/FieldConcatReadOnlyService';
import {
  FieldConcatPicklistService,
} from '../../../modules/field-concatenation/services/FieldConcatPicklistService';
import {
  FieldConcatProcessingService,
} from '../../../modules/field-concatenation/services/FieldConcatProcessingService';

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../../modules/field-concatenation/services/FieldConcatReadOnlyService', () => ({
  FieldConcatReadOnlyService: { preview: jest.fn() },
}));
jest.mock('../../../modules/field-concatenation/services/FieldConcatPicklistService', () => ({
  FieldConcatPicklistService: { resolve: jest.fn() },
}));

describe('FieldConcatProcessingService', () => {
  const readOnly = FieldConcatReadOnlyService.preview as jest.Mock;
  const picklist = FieldConcatPicklistService.resolve as jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    readOnly.mockResolvedValue({
      projectId: 1000, taskId: 87701, separator: '_',
      inputFieldCount: 2, outputFieldCount: 1, processingCompleted: false,
      fields: [
        {
          fieldId: 'beginDate', fieldName: 'Year', dataType: 'Text',
          objectType: 'Activity', operation: 'ExtractYear', status: 'RAW_VALUE',
          rawValue: '2025-04-15', pendingSteps: ['TRANSFORMATION'],
        },
        {
          fieldId: 'GLOBAL', fieldName: '', dataType: 'Text',
          objectType: 'Constant', operation: 'NA', status: 'CONSTANT',
          rawValue: 'GLOBAL', pendingSteps: [],
        },
      ],
    });
  });

  it('concatenates resolved fields in configured order with correlation logs', async () => {
    const result = await FieldConcatProcessingService.preview(1000, 87701, 'development');
    expect(result.readyForConcatenation).toBe(true);
    expect(result.concatenatedValue).toBe('2025_GLOBAL');
    expect(result.processingCompleted).toBe(false);
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'FCU concatenation preview processing ended',
      options: expect.objectContaining({ correlationId: '1000', outcome: 'READY' }),
    });
  });

  it('preserves blank separators', async () => {
    readOnly.mockResolvedValueOnce({
      ...(await readOnly()), separator: '',
    });
    const result = await FieldConcatProcessingService.preview(1000, 87701, 'development');
    expect(result.concatenatedValue).toBe('2025GLOBAL');
  });

  it('blocks concatenation rather than inventing mapping-sheet abbreviations', async () => {
    readOnly.mockResolvedValueOnce({
      projectId: 1000, taskId: 87701, separator: '_', inputFieldCount: 1,
      outputFieldCount: 1, processingCompleted: false,
      fields: [{
        fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA',
        objectType: 'Activity', operation: 'UseMappingSheet',
        status: 'PENDING_WEB_REPORT', rawValue: '900',
        pendingSteps: ['WEB_REPORT', 'MAPPING_SHEET'],
      }],
    });
    picklist.mockResolvedValue({ value: 'Johnson & Johnson' });
    const result = await FieldConcatProcessingService.preview(1000, 87701, 'development');
    expect(result.fields[0].resolutionStatus).toBe('PENDING_MAPPING');
    expect(result.fields[0].displayValue).toBe('Johnson & Johnson');
    expect(result.readyForConcatenation).toBe(false);
    expect(result.concatenatedValue).toBeNull();
  });

  it('keeps a pending report unresolved when report ID is not configured', async () => {
    readOnly.mockResolvedValueOnce({
      projectId: 1000, taskId: 87701, separator: '_', inputFieldCount: 1,
      outputFieldCount: 1, processingCompleted: false,
      fields: [{
        fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA',
        objectType: 'Activity', operation: 'UseMappingSheet',
        status: 'PENDING_WEB_REPORT', rawValue: '900',
        pendingSteps: ['WEB_REPORT', 'MAPPING_SHEET'],
      }],
    });
    picklist.mockResolvedValue({
      pendingReason: 'FCU_WEB_REPORT_ID is not configured',
    });
    const result = await FieldConcatProcessingService.preview(1000, 87701, 'development');
    expect(result.fields[0].resolutionStatus).toBe('PENDING_WEB_REPORT');
    expect(result.concatenatedValue).toBeNull();
  });
});
