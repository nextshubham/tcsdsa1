import { DamFieldMappingParser } from '../../../../modules/create-dam-record/utils/damFieldMappingParser';

/**
 * Matches the PM project InputParameters EA structure used by the
 * Create DAM Record webhook. The parser receives the EA's JSON string.
 */
const createRawValue = (pmDigitalAssetTypeId: unknown): string =>
  JSON.stringify({
    inputParameters: {
      DamFieldList: {
        items: [
          {
            damContentType: 'MLR Approval Record',
            damProjectTitleFieldId: 'b0a7b336-ceed-4fa0-9dd3-b03e007724e7',
            damClassificationId: '20e5bf28e88449a9b521afc400451b90',
          },
        ],
      },
      PMFieldList: {
        items: [{ pmDigitalAssetTypeId }],
      },
    },
  });

describe('DamFieldMappingParser', () => {
  describe('existing FIELD_MAPPING behavior', () => {
    it('parses a valid configuration and preserves DAM field values', () => {
      const result = DamFieldMappingParser.parse(createRawValue('1701'));

      expect(result.DamFieldList.items[0]).toEqual({
        damContentType: 'MLR Approval Record',
        damProjectTitleFieldId: 'b0a7b336-ceed-4fa0-9dd3-b03e007724e7',
        damClassificationId: '20e5bf28e88449a9b521afc400451b90',
      });
      expect(result.PMFieldList.items[0].pmDigitalAssetTypeId).toBe('1701');
    });
  });

  describe('pmDigitalAssetTypeId validation', () => {
    it.each([
      ['positive numeric ID', 1701, '1701'],
      ['positive string ID', '1701', '1701'],
      ['string ID with whitespace', ' 1701 ', '1701'],
      ['smallest positive numeric ID', 1, '1'],
      ['smallest positive string ID', '1', '1'],
      [
        'largest safe positive numeric ID',
        Number.MAX_SAFE_INTEGER,
        String(Number.MAX_SAFE_INTEGER),
      ],
    ])('accepts %s', (_description, input, expected) => {
      const result = DamFieldMappingParser.parse(createRawValue(input));

      expect(result.PMFieldList.items[0].pmDigitalAssetTypeId).toBe(
        expected
      );
    });

    it.each([
      ['zero as a number', 0],
      ['zero as a string', '0'],
      ['negative number', -5],
      ['negative string', '-5'],
      ['fractional number', 12.5],
      ['fractional string', '12.5'],
      ['non-numeric string', 'invalid-id'],
      ['scientific notation string', '1e3'],
      ['hexadecimal string', '0x10'],
      ['plus-sign string', '+5'],
      ['empty string', ''],
      ['whitespace-only string', '   '],
      ['number exceeding safe integer', Number.MAX_SAFE_INTEGER + 1],
      ['string exceeding safe integer', '9007199254740992'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['object', { id: 1701 }],
      ['array', [1701]],
    ])('rejects %s before any external write', (_description, input) => {
      expect(() => DamFieldMappingParser.parse(createRawValue(input))).toThrow(
        /PMFieldList\.items\[0\]\.pmDigitalAssetTypeId must be a positive safe integer/
      );
    });
  });
});
