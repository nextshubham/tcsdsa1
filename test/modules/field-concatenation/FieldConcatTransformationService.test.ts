import {
  FieldConcatTransformationService,
} from '../../../modules/field-concatenation/services/FieldConcatTransformationService';

describe('FieldConcatTransformationService', () => {
  it('supports no operation or NA for constants', () => {
    expect(FieldConcatTransformationService.apply('GLOBAL', 'NA')).toBe('GLOBAL');
    expect(FieldConcatTransformationService.apply('GLOBAL', '')).toBe('GLOBAL');
  });

  it('extracts the year, month and date from an ISO date', () => {
    const date = '2025-04-15T00:00:00Z';
    expect(FieldConcatTransformationService.apply(date, 'ExtractYear')).toBe('2025');
    expect(FieldConcatTransformationService.apply(date, 'Extract(Month)')).toBe('04');
    expect(FieldConcatTransformationService.apply(date, 'Extract(Date)')).toBe('2025-04-15');
  });

  it('trims text using Java-compatible and design-document forms', () => {
    expect(FieldConcatTransformationService.apply('Johnson', 'Trim(4)')).toBe('John');
    expect(FieldConcatTransformationService.apply('Johnson', 'TRIM:2')).toBe('Jo');
  });

  it('rounds decimal values half up, including negative halves', () => {
    expect(FieldConcatTransformationService.apply('7854326.22', 'Dec(0)'))
      .toBe('7854326');
    expect(FieldConcatTransformationService.apply('12.345', 'Dec(2)'))
      .toBe('12.35');
    expect(FieldConcatTransformationService.apply('-1.5', 'DECIMAL:0'))
      .toBe('-2');
  });

  it('rejects unknown operations and invalid values', () => {
    expect(() => FieldConcatTransformationService.apply('a', 'UseRandom')).toThrow(
      'Unsupported FCU operation'
    );
    expect(() => FieldConcatTransformationService.apply('foo', 'Dec(2)'))
      .toThrow(/numeric/);
    expect(() => FieldConcatTransformationService.apply('not a date', 'ExtractYear'))
      .toThrow(/valid date/);
  });
});
