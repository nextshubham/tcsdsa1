import { FieldConcatFieldValueService } from '../../../modules/field-concatenation/services/FieldConcatFieldValueService';
import type { FieldConcatInfo } from '../../../modules/field-concatenation/models/FieldConcatInfo';

const config: FieldConcatInfo = {
  separator: '_',
  inputConcatFields: [
    { fieldId: '20401', fieldName: 'Brand', dataType: 'PicklistEA', objectType: 'Activity', fieldLogic: 'UseMappingSheet' },
    { fieldId: 'beginDate', fieldName: 'Year', dataType: 'Text', objectType: 'Activity', fieldLogic: 'ExtractYear' },
    { fieldId: 'GLOBAL', fieldName: '', dataType: 'Text', objectType: 'Constant', fieldLogic: 'NA' },
    { fieldId: '55', fieldName: '', dataType: 'TextEA', objectType: 'Project', fieldLogic: '' },
    { fieldId: '777', fieldName: '', dataType: 'NumericEA', objectType: 'Task', fieldLogic: '' },
  ],
  output: [{ fieldId: '700', dataType: 'TextEA', objectType: 'Project' }],
};

describe('FieldConcatFieldValueService', () => {
  it('extracts raw values in configuration order without applying transformations', () => {
    const fields = FieldConcatFieldValueService.previewFields(config, {
      projectId: 1000,
      taskId: 87701,
      activityId: 300,
      project: { extendedAttributes: [{ eaId: 55, eaValue: 'Campaign' }] },
      task: { extendedAttributes: [{ eaId: 777, eaValue: 13.5 }] },
      activity: {
        beginDate: '2026-11-25T00:00:00Z',
        extendedAttributes: [{ eaId: 20401, eaValue: '1234' }],
      },
    });

    expect(fields.map((field) => field.fieldId)).toEqual([
      '20401', 'beginDate', 'GLOBAL', '55', '777',
    ]);
    expect(fields[0]).toEqual(expect.objectContaining({
      status: 'PENDING_WEB_REPORT', rawValue: '1234',
      pendingSteps: ['WEB_REPORT', 'MAPPING_SHEET'],
    }));
    expect(fields[1]).toEqual(expect.objectContaining({
      status: 'RAW_VALUE', rawValue: '2026-11-25T00:00:00Z',
      pendingSteps: ['TRANSFORMATION'],
    }));
    expect(fields[2]).toEqual(expect.objectContaining({
      status: 'CONSTANT', rawValue: 'GLOBAL',
    }));
    expect(fields[3].rawValue).toBe('Campaign');
    expect(fields[4].rawValue).toBe('13.5');
  });

  it('reports missing EAs without manufacturing values', () => {
    const fields = FieldConcatFieldValueService.previewFields(config, {
      projectId: 1000,
      taskId: 87701,
      project: {}, task: {}, activity: {},
    });
    expect(fields[0].status).toBe('MISSING');
    expect(fields[3].status).toBe('MISSING');
  });

  it('returns raw multiselect IDs without incorrectly resolving display values', () => {
    const multiselect: FieldConcatInfo = {
      separator: '',
      inputConcatFields: [{
        fieldId: '5', fieldName: 'Markets', dataType: 'MultiselectPicklistEA',
        objectType: 'Activity', fieldLogic: '',
      }],
      output: [],
    };
    const fields = FieldConcatFieldValueService.previewFields(multiselect, {
      projectId: 1000, taskId: 87701, project: {}, task: {},
      activity: { multiValueExtendedAttributes: [{ eaId: 5, eaValues: [123, 456] }] },
    });
    expect(fields[0]).toEqual(expect.objectContaining({
      rawValue: ['123', '456'],
      status: 'PENDING_WEB_REPORT',
    }));
  });
});
