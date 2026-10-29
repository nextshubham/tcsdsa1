import { DamFieldMappingParser } from '../../utils/damFieldMappingParser';

describe('DamFieldMappingParser', () => {
  const inputParameters = {
    DamFieldList: {
      items: [
        {
          damContentType: 'MLR Approval Record',
          damProjectTitleFieldId: 'title-field-id',
          damClassificationId: 'classification-id',
        },
      ],
    },
    PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
  };
  const configuration = { inputParameters };

  it('recognizes the new lowercase inputParameters configuration as a JSON string', () => {
    expect(DamFieldMappingParser.canParse(JSON.stringify(configuration))).toBe(true);
  });

  it('recognizes the new configuration provided as an object', () => {
    expect(DamFieldMappingParser.canParse(configuration)).toBe(true);
  });

  it('does not classify the old InputParameters array as a field mapping', () => {
    expect(DamFieldMappingParser.canParse({ InputParameters: [] })).toBe(false);
  });

  it('rejects malformed JSON when determining the format', () => {
    expect(DamFieldMappingParser.canParse('{not-json')).toBe(false);
  });

  it('extracts both DAM fields and PM asset type IDs', () => {
    const result = DamFieldMappingParser.parse(JSON.stringify(configuration));
    expect(result.DamFieldList.items).toEqual(inputParameters.DamFieldList.items);
    expect(result.PMFieldList.items).toEqual(inputParameters.PMFieldList.items);
  });

  it('accepts an object value as well as a serialized value', () => {
    const result = DamFieldMappingParser.parse(configuration);
    expect(result.DamFieldList.items[0].damContentType).toBe('MLR Approval Record');
  });

  it('normalizes a positive numeric PM asset type ID to a string', () => {
    const data = {
      inputParameters: {
        ...inputParameters,
        PMFieldList: { items: [{ pmDigitalAssetTypeId: 1701 }] },
      },
    };
    expect(DamFieldMappingParser.parse(data).PMFieldList.items[0].pmDigitalAssetTypeId)
      .toBe('1701');
  });

  it('rejects a missing DAM field list', () => {
    expect(() => DamFieldMappingParser.parse({
      inputParameters: { PMFieldList: inputParameters.PMFieldList },
    })).toThrow();
  });

  it('rejects an empty PM field list', () => {
    expect(() => DamFieldMappingParser.parse({
      inputParameters: { ...inputParameters, PMFieldList: { items: [] } },
    })).toThrow();
  });

  it('rejects an empty DAM content type', () => {
    const badConfig = {
      inputParameters: {
        ...inputParameters,
        DamFieldList: {
          items: [{ ...inputParameters.DamFieldList.items[0], damContentType: '  ' }],
        },
      },
    };
    expect(() => DamFieldMappingParser.parse(badConfig)).toThrow();
  });

  it('rejects an invalid PM asset type ID', () => {
    const badConfig = {
      inputParameters: {
        ...inputParameters,
        PMFieldList: { items: [{ pmDigitalAssetTypeId: -5 }] },
      },
    };
    expect(() => DamFieldMappingParser.parse(badConfig)).toThrow();
  });
});
