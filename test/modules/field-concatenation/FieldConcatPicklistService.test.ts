import logger from '../../../utils/logger';
import {
  AprimoWebReportService,
} from '../../../integrations/aprimo/reports/aprimoWebReportService';
import {
  FieldConcatPicklistService,
} from '../../../modules/field-concatenation/services/FieldConcatPicklistService';
import type {
  FieldConcatReadResult,
} from '../../../modules/field-concatenation/models/FieldConcatReadOnly';

jest.mock('../../../integrations/aprimo/reports/aprimoWebReportService', () => ({
  AprimoWebReportService: { execute: jest.fn() },
}));
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const brand: FieldConcatReadResult = {
  fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA',
  objectType: 'Activity', operation: 'UseMappingSheet',
  status: 'PENDING_WEB_REPORT', rawValue: '900',
  pendingSteps: ['WEB_REPORT', 'MAPPING_SHEET'],
};

describe('FieldConcatPicklistService', () => {
  const originalId = process.env.FCU_WEB_REPORT_ID;
  const execute = AprimoWebReportService.execute as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FCU_WEB_REPORT_ID = '10000';
  });

  afterAll(() => {
    if (originalId === undefined) delete process.env.FCU_WEB_REPORT_ID;
    else process.env.FCU_WEB_REPORT_ID = originalId;
  });

  it('reports missing report configuration without issuing a request', async () => {
    delete process.env.FCU_WEB_REPORT_ID;
    expect(await FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .toEqual({ pendingReason: 'FCU_WEB_REPORT_ID is not configured' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves PicklistEA using Java Web Report response keys', async () => {
    execute.mockResolvedValue({
      ReportDetails: { Rows: [
        { Encoded_List_Item_ID: '900', Value__: 'Aveeno' },
      ] },
    });
    expect(await FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .toEqual({ value: 'Aveeno' });
    expect(execute).toHaveBeenCalledWith({
      reportId: '10000', itemIds: ['900'], correlationId: '1000',
      environment: 'development',
    });
    expect(logger.info).toHaveBeenCalledWith({
      msg: 'FCU picklist resolution completed',
      options: expect.objectContaining({ correlationId: '1000', fieldId: '20401' }),
    });
  });

  it('resolves multiple IDs in one request and picks the alphabetically first value', async () => {
    execute.mockResolvedValue({
      ReportDetails: { Rows: [
        { Encoded_List_Item_ID: '1', Value__: 'Zebra' },
        { Encoded_List_Item_ID: '2', Value__: 'Apple' },
      ] },
    });
    const result = await FieldConcatPicklistService.resolve({
      ...brand, dataType: 'MultiselectpicklistEA', rawValue: ['1', '2'],
    }, '1000', 'development');
    expect(result).toEqual({ value: 'Apple' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      reportId: '10000', itemIds: ['1', '2'], correlationId: '1000',
      environment: 'development',
    });
  });

  it('rejects mismatched Web Report response structures', async () => {
    execute.mockResolvedValue({ reportDetails: { rows: [] } });
    await expect(FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .rejects.toThrow('Web Report response does not contain ReportDetails.Rows');
    expect(logger.error).toHaveBeenCalledWith({
      msg: 'FCU picklist resolution failed',
      options: expect.objectContaining({ correlationId: '1000' }),
    });
  });

  it('rejects when a requested item has no display value', async () => {
    execute.mockResolvedValue({ ReportDetails: { Rows: [] } });
    await expect(FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .rejects.toThrow('Web Report display value not found for list item');
  });

  it('leaves missing raw item IDs unresolved', async () => {
    expect(await FieldConcatPicklistService.resolve({
      ...brand, rawValue: undefined,
    }, '1000', 'development')).toEqual({
      pendingReason: 'Picklist item ID is unavailable',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
