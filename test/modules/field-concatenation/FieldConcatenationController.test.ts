import { FieldConcatConfigParser } from '../../../modules/field-concatenation/parsers/FieldConcatConfigParser';

describe('FieldConcatConfigParser', () => {
  it('parses the confirmed five-part input format in the correct order', () => {
    const config = FieldConcatConfigParser.parse(
      "'_',20401|Brand|PicklistEA|Activity|UseMappingSheet,34801|Market|PicklistEA|Activity|UseMappingSheet,beginDate|Year|Text|Activity|ExtractYear,GLOBAL||NA|Constant|",
      '50001|TextEA|Project,50002|TextEA|Activity'
    );

    expect(config.separator).toBe('_');
    expect(config.inputConcatFields).toEqual([
      {
        fieldId: '20401',
        fieldName: 'Brand',
        dataType: 'PicklistEA',
        objectType: 'Activity',
        fieldLogic: 'UseMappingSheet',
      },
      {
        fieldId: '34801',
        fieldName: 'Market',
        dataType: 'PicklistEA',
        objectType: 'Activity',
        fieldLogic: 'UseMappingSheet',
      },
      {
        fieldId: 'beginDate',
        fieldName: 'Year',
        dataType: 'Text',
        objectType: 'Activity',
        fieldLogic: 'ExtractYear',
      },
      {
        fieldId: 'GLOBAL',
        fieldName: '',
        dataType: 'NA',
        objectType: 'Constant',
        fieldLogic: '',
      },
    ]);
    expect(config.output).toEqual([
      { fieldId: '50001', dataType: 'TextEA', objectType: 'Project' },
      { fieldId: '50002', dataType: 'TextEA', objectType: 'Activity' },
    ]);
  });

  it.each([
    ['blank', ','],
    ['empty quoted', "'',"],
    ['space', "' ',"],
    ['hyphen', '-,'],
    ['underscore', "'_',"],
    ['multiple characters', "' - ',"],
    ['quoted comma', "',',"],
  ])('supports %s separator', (_description, separatorPart) => {
    const config = FieldConcatConfigParser.parse(
      `${separatorPart}GLOBAL||NA|Constant|`,
      '50001|TextEA|Project'
    );

    const expectedSeparator: Record<string, string> = {
      blank: '',
      'empty quoted': '',
      space: ' ',
      hyphen: '-',
      underscore: '_',
      'multiple characters': ' - ',
      'quoted comma': ',',
    };

    expect(config.separator).toBe(expectedSeparator[_description]);
  });

  it.each([
    'NumericEA',
    'TextEA',
    'PicklistEA',
    'MultiselectPicklistEA',
    'MultiValuePicklistEA',
    'DateTimeEA',
    'DateEA',
    'Text',
    'NA',
  ])('accepts supported DataType %s', (dataType) => {
    const config = FieldConcatConfigParser.parse(
      `-,field||${dataType}|Project`,
      '50001|TextEA|Project'
    );
    expect(config.inputConcatFields[0].dataType).toBe(dataType);
  });

  it.each(['Project', 'Activity', 'Task', 'Constant'])(
    'accepts ObjectType %s for inputs',
    (objectType) => {
      const config = FieldConcatConfigParser.parse(
        `-,VALUE||NA|${objectType}`,
        '50001|TextEA|Project'
      );
      expect(config.inputConcatFields[0].objectType).toBe(objectType);
    }
  );

  it('allows FieldName to be blank without mapping and omits the Operation', () => {
    const config = FieldConcatConfigParser.parse(
      '_,beginDate||DateTimeEA|Activity',
      'name|Text|Task'
    );
    expect(config.inputConcatFields[0]).toEqual({
      fieldId: 'beginDate',
      fieldName: '',
      dataType: 'DateTimeEA',
      objectType: 'Activity',
      fieldLogic: '',
    });
  });

  it.each(['UseMappingSheet', 'MAPPING_SHEET'])(
    'requires FieldName for %s',
    (operation) => {
      expect(() =>
        FieldConcatConfigParser.parse(
          `-,20401||PicklistEA|Activity|${operation}`,
          '50001|TextEA|Project'
        )
      ).toThrow('FieldName is required for UseMappingSheet');
    }
  );

  it('does not silently swap DataType and ObjectType', () => {
    expect(() =>
      FieldConcatConfigParser.parse(
        '-,20401|Brand|Activity|PicklistEA|UseMappingSheet',
        '50001|TextEA|Project'
      )
    ).toThrow('DataType must be the 3rd parameter and ObjectType the 4th');
  });

  it('rejects three-part input because ObjectType must be fourth', () => {
    expect(() =>
      FieldConcatConfigParser.parse(
        '-,20401|PicklistEA|Activity',
        '50001|TextEA|Project'
      )
    ).toThrow('expected FieldId|FieldName|DataType|ObjectType|Operation');
  });

  it('rejects missing ObjectType and invalid DataType', () => {
    expect(() =>
      FieldConcatConfigParser.parse(
        '-,12|Name|TextEA||None',
        '50001|TextEA|Project'
      )
    ).toThrow('unsupported or missing ObjectType');
    expect(() =>
      FieldConcatConfigParser.parse(
        '-,12|Name|UnknownEA|Project',
        '50001|TextEA|Project'
      )
    ).toThrow('unsupported or missing DataType');
  });

  it('does not allow Constant as an output destination', () => {
    expect(() =>
      FieldConcatConfigParser.parse(
        '-,GLOBAL||NA|Constant',
        '50001|TextEA|Constant'
      )
    ).toThrow('Constant is not a writable ObjectType');
  });

  it('requires input and output configurations', () => {
    expect(() => FieldConcatConfigParser.parse('', '50001|TextEA|Project')).toThrow(
      'FCU input concatenation configuration is missing'
    );
    expect(() =>
      FieldConcatConfigParser.parse('-,GLOBAL||NA|Constant', '')
    ).toThrow('FCU output concatenation configuration is missing');
  });

  it('resolves both configurations from the requested Project EAs', () => {
    const config = FieldConcatConfigParser.resolve(
      [
        { eaId: 20, eaValue: '-,GLOBAL||NA|Constant' },
        { eaId: 30, eaValue: '50001|TextEA|Project' },
      ],
      '20',
      '30'
    );
    expect(config.inputConcatFields).toHaveLength(1);
    expect(config.output).toHaveLength(1);
  });

  it('reports missing EA IDs distinctly from invalid field formats', () => {
    expect(() =>
      FieldConcatConfigParser.resolve(
        [{ eaId: 20, eaValue: '-,GLOBAL||NA|Constant' }],
        '20',
        '30'
      )
    ).toThrow('FCU configuration EA not found for ID: 30');
  });
});
