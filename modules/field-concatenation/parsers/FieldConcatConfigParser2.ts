import type { FieldConcatInfo } from '../models/FieldConcatInfo';

type ExtendedAttribute = {
  eaId?: unknown;
  eaValue?: unknown;
};

export class FieldConcatConfigParser {
  private static readonly OBJECT_TYPES: Record<string, string> = {
    project: 'Project',
    activity: 'Activity',
    task: 'Task',
    constant: 'Constant',
  };

  private static readonly DATA_TYPES: Record<string, string> = {
    text: 'Text',
    textea: 'TextEA',
    numeric: 'Numeric',
    numericea: 'NumericEA',
    picklistea: 'PicklistEA',
    multiselectea: 'MultiselectEA',
    multiselectpicklistea: 'MultiselectPicklistEA',
    multivaluepicklistea: 'MultiValuePicklistEA',
    date: 'Date',
    dateea: 'DateEA',
    datetimeea: 'DateTimeEA',
    na: 'NA',
  };

  public static resolve(
    extendedAttributes: ExtendedAttribute[],
    inputEaId: string,
    outputEaId: string
  ): FieldConcatInfo {
    const readValue = (eaId: string): string => {
      const selected = extendedAttributes.find(
        (attribute) => String(attribute.eaId).trim() === eaId.trim()
      );

      if (!selected) {
        throw new Error(`FCU configuration EA not found for ID: ${eaId}`);
      }

      if (typeof selected.eaValue !== 'string') {
        throw new Error(`FCU configuration EA value is not text: ${eaId}`);
      }

      return selected.eaValue;
    };

    return FieldConcatConfigParser.parse(
      readValue(inputEaId),
      readValue(outputEaId)
    );
  }

  public static parse(
    inputConfiguration: string,
    outputConfiguration: string
  ): FieldConcatInfo {
    if (!inputConfiguration.trim()) {
      throw new Error('FCU input concatenation configuration is missing');
    }

    const { separator, fieldEntries } =
      FieldConcatConfigParser.splitInputConfiguration(inputConfiguration);

    const inputConcatFields = fieldEntries.map((entry, index) => {
      const parts = entry.split('|').map((value) => value.trim());
      const position = index + 1;

      if (parts.length !== 4 && parts.length !== 5) {
        throw new Error(
          `Invalid FCU input field ${position}: expected FieldId|FieldName|DataType|ObjectType|Operation (Operation may be omitted)`
        );
      }

      const [fieldId, fieldName, rawDataType, rawObjectType, fieldLogic = ''] =
        parts;

      if (!fieldId) {
        throw new Error(`Invalid FCU input field ${position}: FieldId is required`);
      }

      const { dataType, objectType } = FieldConcatConfigParser.validateTypes(
        rawDataType,
        rawObjectType,
        `input field ${position}`
      );

      if (
        FieldConcatConfigParser.isMappingOperation(fieldLogic) &&
        !fieldName
      ) {
        throw new Error(
          `Invalid FCU input field ${position}: FieldName is required for UseMappingSheet`
        );
      }

      return { fieldId, fieldName, dataType, objectType, fieldLogic };
    });

    if (!outputConfiguration.trim()) {
      throw new Error('FCU output concatenation configuration is missing');
    }

    const outputEntries = FieldConcatConfigParser.splitEntries(
      outputConfiguration,
      'output'
    );

    const output = outputEntries.map((entry, index) => {
      const parts = entry.split('|').map((value) => value.trim());
      const position = index + 1;

      if (parts.length !== 3) {
        throw new Error(
          `Invalid FCU output field ${position}: expected FieldId|DataType|ObjectType`
        );
      }

      const [fieldId, rawDataType, rawObjectType] = parts;

      if (!fieldId) {
        throw new Error(`Invalid FCU output field ${position}: FieldId is required`);
      }

      const { dataType, objectType } = FieldConcatConfigParser.validateTypes(
        rawDataType,
        rawObjectType,
        `output field ${position}`
      );

      if (objectType === 'Constant') {
        throw new Error(
          `Invalid FCU output field ${position}: Constant is not a writable ObjectType`
        );
      }

      return { fieldId, dataType, objectType };
    });

    return { separator, inputConcatFields, output };
  }

  private static splitInputConfiguration(input: string): {
    separator: string;
    fieldEntries: string[];
  } {
    const firstNonWhitespace = input.search(/\S/);
    const leadingChar = input[firstNonWhitespace];
    let separator: string;
    let delimiterPosition: number;

    if (leadingChar === "'" || leadingChar === '"') {
      const closingQuote = input.indexOf(leadingChar, firstNonWhitespace + 1);
      if (closingQuote === -1) {
        throw new Error('FCU separator has an unclosed quote');
      }

      const afterQuote = input.slice(closingQuote + 1);
      const commaOffset = afterQuote.search(/\S/);
      delimiterPosition = closingQuote + 1 + commaOffset;

      if (commaOffset < 0 || input[delimiterPosition] !== ',') {
        throw new Error('FCU separator must be followed by a comma');
      }

      separator = input.slice(firstNonWhitespace + 1, closingQuote);
    } else {
      delimiterPosition = input.indexOf(',');
      if (delimiterPosition < 0) {
        throw new Error('FCU separator must be followed by a comma');
      }

      const rawSeparator = input.slice(0, delimiterPosition);
      separator = rawSeparator.trim() || rawSeparator;
    }

    const fieldEntries = FieldConcatConfigParser.splitEntries(
      input.slice(delimiterPosition + 1),
      'input'
    );

    return { separator, fieldEntries };
  }

  private static splitEntries(value: string, type: 'input' | 'output'): string[] {
    const parts = value.split(',');
    if (parts[parts.length - 1]?.trim() === '') {
      parts.pop();
    }

    if (!parts.length) {
      throw new Error(`FCU ${type} fields are missing`);
    }

    return parts.map((entry, index) => {
      const trimmed = entry.trim();
      if (!trimmed) {
        throw new Error(`Invalid FCU ${type} field ${index + 1}: field is blank`);
      }
      return trimmed;
    });
  }

  private static normalize(value: string): string {
    return value.replace(/[\s_\-/]/g, '').toLowerCase();
  }

  private static isMappingOperation(operation: string): boolean {
    const normalized = FieldConcatConfigParser.normalize(operation);
    return normalized === 'usemappingsheet' || normalized === 'mappingsheet';
  }

  private static validateTypes(
    rawDataType: string,
    rawObjectType: string,
    context: string
  ): { dataType: string; objectType: string } {
    const dataType = FieldConcatConfigParser.DATA_TYPES[
      FieldConcatConfigParser.normalize(rawDataType)
    ];
    const objectType = FieldConcatConfigParser.OBJECT_TYPES[
      FieldConcatConfigParser.normalize(rawObjectType)
    ];

    if (dataType && objectType) {
      return { dataType, objectType };
    }

    const swapped =
      FieldConcatConfigParser.OBJECT_TYPES[
        FieldConcatConfigParser.normalize(rawDataType)
      ] &&
      FieldConcatConfigParser.DATA_TYPES[
        FieldConcatConfigParser.normalize(rawObjectType)
      ];

    if (swapped) {
      throw new Error(
        `Invalid FCU ${context}: DataType must be the 3rd parameter and ObjectType the 4th for input fields (types are reversed)`
      );
    }

    if (!dataType) {
      throw new Error(
        `Invalid FCU ${context}: unsupported or missing DataType "${rawDataType}"`
      );
    }

    throw new Error(
      `Invalid FCU ${context}: unsupported or missing ObjectType "${rawObjectType}"`
    );
  }
}
