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

const brand: FieldConcatReadResult = {
  fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA',
  objectType: 'Activity', operation: '', status: 'PENDING_WEB_REPORT',
  rawValue: '900', pendingSteps: ['WEB_REPORT'],
};

describe('FieldConcatPicklistService', () => {
  const originalTemplate = process.env.FCU_WEB_REPORT_PATH_TEMPLATE;
  const execute = AprimoWebReportService.execute as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FCU_WEB_REPORT_PATH_TEMPLATE;
  });

  afterAll(() => {
    if (originalTemplate === undefined) delete process.env.FCU_WEB_REPORT_PATH_TEMPLATE;
    else process.env.FCU_WEB_REPORT_PATH_TEMPLATE = originalTemplate;
  });

  it('leaves Web Report unresolved until a verified path is configured', async () => {
    expect(await FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .toEqual({ pendingReason: 'Web Report path template is not configured' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('resolves a PicklistEA display value with the configured path', async () => {
    process.env.FCU_WEB_REPORT_PATH_TEMPLATE =
      'api/report?field={fieldId}&item={itemId}&source={objectType}';
    execute.mockResolvedValue({
      reportDetails: { rows: [{ listItemId: '900', listActualValue: 'Aveeno' }] },
    });
    expect(await FieldConcatPicklistService.resolve(brand, '1000', 'development'))
      .toEqual({ value: 'Aveeno' });
    expect(execute).toHaveBeenCalledWith({
      path: 'api/report?field=20401&item=900&source=Activity',
      correlationId: '1000', environment: 'development',
    });
  });

  it('uses the first alphabetically sorted multiselect display value', async () => {
    process.env.FCU_WEB_REPORT_PATH_TEMPLATE = 'api/report?item={itemId}';
    execute.mockImplementation(async ({ path }: { path: string }) => ({
      rows: [{
        listItemId: path.endsWith('1') ? '1' : '2',
        listActualValue: path.endsWith('1') ? 'Zebra' : 'Apple',
      }],
    }));
    const result = await FieldConcatPicklistService.resolve({
      ...brand, dataType: 'MultiselectPicklistEA', rawValue: ['1', '2'],
    }, '1000', 'development');
    expect(result.value).toBe('Apple');
  });

  it('rejects unknown report response structure instead of treating IDs as names', async () => {
    process.env.FCU_WEB_REPORT_PATH_TEMPLATE = 'api/report?item={itemId}';
    execute.mockResolvedValue({ otherField: [] });
    await expect(
      FieldConcatPicklistService.resolve(brand, '1000', 'development')
    ).rejects.toThrow('Web Report response does not contain rows');
  });
});
