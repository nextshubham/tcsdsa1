import { DamFieldMappingParser } from '../../../../modules/create-dam-record/utils/damFieldMappingParser';

const makeDamItem = () => ({
  damContentType: 'MLR Approval Record',
  damProjectTitleFieldId: 'b0a7b336-ceed-4fa0-9dd3-b03e007724e7',
  damClassificationId: '20e5bf28e88449a9b521afc400451b90',
});

const makePmItem = (pmDigitalAssetTypeId: unknown) => ({
  pmDigitalAssetTypeId,
});

const makeConfiguration = (pmDigitalAssetTypeId: unknown) => ({
  inputParameters: {
    DamFieldList: { items: [makeDamItem()] },
    PMFieldList: { items: [makePmItem(pmDigitalAssetTypeId)] },
  },
});

const withDamItems = (items: unknown) => ({
  inputParameters: {
    ...makeConfiguration('1701').inputParameters,
    DamFieldList: { items },
  },
});

const withPmItems = (items: unknown) => ({
  inputParameters: {
    ...makeConfiguration('1701').inputParameters,
    PMFieldList: { items },
  },
});

describe('DamFieldMappingParser', () => {
  describe('canParse', () => {
    it('recognizes FIELD_MAPPING configuration supplied as an object', () => {
      expect(DamFieldMappingParser.canParse(makeConfiguration('1701'))).toBe(true);
    });

    it('recognizes FIELD_MAPPING configuration supplied as a JSON string', () => {
      expect(
        DamFieldMappingParser.canParse(JSON.stringify(makeConfiguration('1701')))
      ).toBe(true);
    });

    it('only checks the outer shape and does not require complete lists', () => {
      expect(
        DamFieldMappingParser.canParse({ inputParameters: {} })
      ).toBe(true);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['array', []],
      ['number', 12],
      ['boolean', false],
      ['invalid JSON', '{invalid-json'],
      ['JSON null', 'null'],
      ['JSON array', '[]'],
      ['missing inputParameters', {}],
      ['null inputParameters', { inputParameters: null }],
      ['array inputParameters', { inputParameters: [] }],
      ['string inputParameters', { inputParameters: 'invalid' }],
    ])('returns false for %s', (_description, value) => {
      expect(DamFieldMappingParser.canParse(value)).toBe(false);
    });
  });

  describe('parse - valid configurations', () => {
    it('parses object input and preserves both DAM and PM field mappings', () => {
      const result = DamFieldMappingParser.parse(makeConfiguration('1701'));

      expect(result.DamFieldList.items).toEqual([makeDamItem()]);
      expect(result.PMFieldList.items).toEqual([
        { pmDigitalAssetTypeId: '1701' },
      ]);
    });

    it('parses the JSON string stored in the PM InputParameters EA', () => {
      const rawValue = JSON.stringify(makeConfiguration('2450'));
      const result = DamFieldMappingParser.parse(rawValue);

      expect(result.DamFieldList.items[0]).toEqual(makeDamItem());
      expect(result.PMFieldList.items[0].pmDigitalAssetTypeId).toBe(
        '2450'
      );
    });

    it('trims surrounding whitespace from all required string fields', () => {
      const result = DamFieldMappingParser.parse(
        withDamItems([
          {
            damContentType: '  MLR Approval Record  ',
            damProjectTitleFieldId: '  title-field-id  ',
            damClassificationId: '  classification-id  ',
          },
        ])
      );

      expect(result.DamFieldList.items[0]).toEqual({
        damContentType: 'MLR Approval Record',
        damProjectTitleFieldId: 'title-field-id',
        damClassificationId: 'classification-id',
      });
    });

    it('parses multiple DAM and PM mapping entries', () => {
      const configuration = {
        inputParameters: {
          DamFieldList: {
            items: [
              makeDamItem(),
              {
                damContentType: 'Secondary Record',
                damProjectTitleFieldId: 'second-title-id',
                damClassificationId: 'second-classification-id',
              },
            ],
          },
          PMFieldList: {
            items: [makePmItem('1701'), makePmItem(2050)],
          },
        },
      };

      const result = DamFieldMappingParser.parse(configuration);

      expect(result.DamFieldList.items).toHaveLength(2);
      expect(result.DamFieldList.items[1].damContentType).toBe(
        'Secondary Record'
      );
      expect(result.PMFieldList.items).toEqual([
        { pmDigitalAssetTypeId: '1701' },
        { pmDigitalAssetTypeId: '2050' },
      ]);
    });
  });

  describe('parse - malformed configuration', () => {
    it.each(['{invalid-json', '{"inputParameters":', ''])(
      'rejects malformed JSON: %s',
      (value) => {
        expect(() => DamFieldMappingParser.parse(value)).toThrow(
          'Invalid field mapping JSON'
        );
      }
    );

    it.each([
      ['null', null],
      ['array', []],
      ['number', 5],
      ['boolean', true],
    ])('rejects %s as the root configuration', (_description, value) => {
      expect(() => DamFieldMappingParser.parse(value)).toThrow(
        'Field mapping configuration must be an object'
      );
    });

    it.each([
      ['missing', {}],
      ['null', { inputParameters: null }],
      ['array', { inputParameters: [] }],
      ['string', { inputParameters: 'invalid' }],
    ])('rejects %s inputParameters', (_description, value) => {
      expect(() => DamFieldMappingParser.parse(value)).toThrow(
        'inputParameters must be an object'
      );
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['array', []],
      ['string', 'invalid'],
    ])('rejects %s DamFieldList', (_description, list) => {
      const configuration = makeConfiguration('1701');
      expect(() =>
        DamFieldMappingParser.parse({
          inputParameters: {
            ...configuration.inputParameters,
            DamFieldList: list,
          },
        })
      ).toThrow('DamFieldList must be an object');
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['array', []],
      ['string', 'invalid'],
    ])('rejects %s PMFieldList', (_description, list) => {
      const configuration = makeConfiguration('1701');
      expect(() =>
        DamFieldMappingParser.parse({
          inputParameters: {
            ...configuration.inputParameters,
            PMFieldList: list,
          },
        })
      ).toThrow('PMFieldList must be an object');
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty array', []],
      ['object', {}],
      ['string', 'invalid'],
    ])('rejects DamFieldList.items when %s', (_description, items) => {
      expect(() => DamFieldMappingParser.parse(withDamItems(items))).toThrow(
        'DamFieldList.items must be a non-empty array'
      );
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty array', []],
      ['object', {}],
      ['string', 'invalid'],
    ])('rejects PMFieldList.items when %s', (_description, items) => {
      expect(() => DamFieldMappingParser.parse(withPmItems(items))).toThrow(
        'PMFieldList.items must be a non-empty array'
      );
    });
  });

  describe('parse - DAM item validation', () => {
    it.each([
      ['null', null],
      ['array', []],
      ['string', 'invalid'],
    ])('rejects %s DAM item', (_description, item) => {
      expect(() => DamFieldMappingParser.parse(withDamItems([item]))).toThrow(
        'DamFieldList.items[0] must be an object'
      );
    });

    it.each([
      ['damContentType', undefined],
      ['damContentType', '  '],
      ['damContentType', 10],
      ['damProjectTitleFieldId', undefined],
      ['damProjectTitleFieldId', ''],
      ['damProjectTitleFieldId', null],
      ['damClassificationId', undefined],
      ['damClassificationId', '  '],
      ['damClassificationId', false],
    ])('rejects invalid %s: %p', (fieldName, value) => {
      const item = { ...makeDamItem(), [fieldName]: value };

      expect(() => DamFieldMappingParser.parse(withDamItems([item]))).toThrow(
        `DamFieldList.items[0].${fieldName} is required`
      );
    });

    it('reports the correct index when the second DAM item is invalid', () => {
      expect(() =>
        DamFieldMappingParser.parse(
          withDamItems([makeDamItem(), { ...makeDamItem(), damContentType: '' }])
        )
      ).toThrow('DamFieldList.items[1].damContentType is required');
    });
  });

  describe('parse - PM asset-type ID validation', () => {
    it.each([
      ['positive number', 1701, '1701'],
      ['positive string', '1701', '1701'],
      ['whitespace-padded string', ' 1701 ', '1701'],
      ['smallest positive number', 1, '1'],
      ['smallest positive string', '1', '1'],
      ['leading-zero string', '0017', '0017'],
      [
        'maximum safe integer number',
        Number.MAX_SAFE_INTEGER,
        String(Number.MAX_SAFE_INTEGER),
      ],
      [
        'maximum safe integer string',
        String(Number.MAX_SAFE_INTEGER),
        String(Number.MAX_SAFE_INTEGER),
      ],
    ])('accepts %s', (_description, input, expected) => {
      const result = DamFieldMappingParser.parse(makeConfiguration(input));

      expect(result.PMFieldList.items[0].pmDigitalAssetTypeId).toBe(expected);
    });

    it.each([
      ['zero number', 0],
      ['zero string', '0'],
      ['negative number', -5],
      ['negative string', '-5'],
      ['fractional number', 12.5],
      ['fractional string', '12.5'],
      ['invalid string', 'invalid-id'],
      ['scientific notation string', '1e3'],
      ['hexadecimal string', '0x10'],
      ['plus-sign string', '+5'],
      ['empty string', ''],
      ['whitespace-only string', '   '],
      ['unsafe integer number', Number.MAX_SAFE_INTEGER + 1],
      ['unsafe integer string', '9007199254740992'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['object', { id: 1701 }],
      ['array', [1701]],
    ])('rejects %s before DAM creation', (_description, input) => {
      expect(() => DamFieldMappingParser.parse(makeConfiguration(input))).toThrow(
        'PMFieldList.items[0].pmDigitalAssetTypeId must be a positive safe integer'
      );
    });

    it.each([
      ['null', null],
      ['array', []],
      ['string', 'invalid'],
    ])('rejects %s PM item', (_description, item) => {
      expect(() => DamFieldMappingParser.parse(withPmItems([item]))).toThrow(
        'PMFieldList.items[0] must be an object'
      );
    });

    it('reports the correct index when the second PM item is invalid', () => {
      expect(() =>
        DamFieldMappingParser.parse(
          withPmItems([makePmItem('1701'), makePmItem('-5')])
        )
      ).toThrow(
        'PMFieldList.items[1].pmDigitalAssetTypeId must be a positive safe integer'
      );
    });
  });
});
