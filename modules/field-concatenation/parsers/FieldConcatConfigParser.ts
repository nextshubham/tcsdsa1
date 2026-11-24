import type { FieldConcatInfo } from '../models/FieldConcatInfo';

type ExtendedAttribute = {
  eaId?: unknown;
  eaValue?: unknown;
};

export class FieldConcatConfigParser {
  public static resolve(
    extendedAttributes: ExtendedAttribute[],
    inputEaId: string,
    outputEaId?: string
  ): FieldConcatInfo {
    const readValue = (eaId: string): string => {
      const attribute = extendedAttributes.find(
        (item) => String(item.eaId).trim() === eaId
      );

      return typeof attribute?.eaValue === 'string'
        ? attribute.eaValue
        : '';
    };

    return FieldConcatConfigParser.parse(
      readValue(inputEaId),
      outputEaId ? readValue(outputEaId) : ''
    );
  }

  public static parse(
    inputConfiguration: string,
    outputConfiguration: string
  ): FieldConcatInfo {
    if (!inputConfiguration.trim()) {
      throw new Error('FCU input concatenation configuration is missing');
    }

    const [rawSeparator, ...rawFields] = inputConfiguration.split(',');

    if (rawFields.length === 0) {
      throw new Error('FCU input fields are missing');
    }

    const separator =
      rawSeparator.startsWith("'") && rawSeparator.endsWith("'")
        ? rawSeparator.slice(1, -1)
        : rawSeparator;

    const inputConcatFields = rawFields.map((entry) => {
      const [fieldId, fieldName, dataType, objectType, fieldLogic = ''] =
        entry.split('|').map((value) => value.trim());

      if (!fieldId || !fieldName || !dataType || !objectType) {
        throw new Error('Invalid FCU input field configuration');
      }

      return { fieldId, fieldName, dataType, objectType, fieldLogic };
    });

    const output = outputConfiguration.trim()
      ? outputConfiguration.split(',').map((entry) => {
          const [fieldId, dataType, objectType] = entry
            .split('|')
            .map((value) => value.trim());

          if (!fieldId || !dataType || !objectType) {
            throw new Error('Invalid FCU output field configuration');
          }

          return { fieldId, dataType, objectType };
        })
      : [];

    return { separator, inputConcatFields, output };
  }
}
