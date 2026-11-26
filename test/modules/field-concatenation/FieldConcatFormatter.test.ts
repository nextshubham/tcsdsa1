import {
  FieldConcatFormatter,
} from '../../../modules/field-concatenation/utils/FieldConcatFormatter';

describe('FieldConcatFormatter', () => {
  it('preserves configuration order and inserts separators only between values', () => {
    expect(FieldConcatFormatter.join(['JNJ', 'US', '2025', 'GLOBAL'], '_'))
      .toBe('JNJ_US_2025_GLOBAL');
  });

  it('supports a blank, a space and multicharacter separators', () => {
    expect(FieldConcatFormatter.join(['A', 'B'], '')).toBe('AB');
    expect(FieldConcatFormatter.join(['A', 'B'], ' ')).toBe('A B');
    expect(FieldConcatFormatter.join(['A', 'B'], ' - ')).toBe('A - B');
  });
});
