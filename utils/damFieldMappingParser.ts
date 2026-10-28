
import type {
  DamFieldMappingItem,
  PmFieldMappingItem,
  FieldMappingInputParameters,
} from '../models/pmClassification';

type JsonObject = Record<string, unknown>;

export class DamFieldMappingParser {
  private static isRecord(value: unknown): value is JsonObject {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    );
  }

  private static parseJson(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      return parsed;
    } catch {
      throw new Error('Invalid field mapping JSON');
    }
  }

  private static requireObject(
    value: unknown,
    fieldName: string
  ): JsonObject {
    if (!DamFieldMappingParser.isRecord(value)) {
      throw new Error(`${fieldName} must be an object`);
    }

    return value;
  }

  private static requireString(
    value: unknown,
    fieldName: string
  ): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${fieldName} is required`);
    }

    return value.trim();
  }

  private static requireItems(
    value: unknown,
    fieldName: string
  ): unknown[] {
    const list = DamFieldMappingParser.requireObject(
      value,
      fieldName
    );

    if (!Array.isArray(list.items) || list.items.length === 0) {
      throw new Error(`${fieldName}.items must be a non-empty array`);
    }

    return list.items;
  }

  private static parseDamFieldItem(
    value: unknown,
    index: number
  ): DamFieldMappingItem {
    const item = DamFieldMappingParser.requireObject(
      value,
      `DamFieldList.items[${index}]`
    );

    return {
      damContentType: DamFieldMappingParser.requireString(
        item.damContentType,
        `DamFieldList.items[${index}].damContentType`
      ),

      damProjectTitleFieldId: DamFieldMappingParser.requireString(
        item.damProjectTitleFieldId,
        `DamFieldList.items[${index}].damProjectTitleFieldId`
      ),

      damClassificationId: DamFieldMappingParser.requireString(
        item.damClassificationId,
        `DamFieldList.items[${index}].damClassificationId`
      ),
    };
  }

  private static parsePmFieldItem(
    value: unknown,
    index: number
  ): PmFieldMappingItem {
    const item = DamFieldMappingParser.requireObject(
      value,
      `PMFieldList.items[${index}]`
    );

    const assetTypeId = item.pmDigitalAssetTypeId;

    const normalizedAssetTypeId =
      typeof assetTypeId === 'number' &&
      Number.isSafeInteger(assetTypeId) &&
      assetTypeId > 0
        ? String(assetTypeId)
        : assetTypeId;

    return {
      pmDigitalAssetTypeId: DamFieldMappingParser.requireString(
        normalizedAssetTypeId,
        `PMFieldList.items[${index}].pmDigitalAssetTypeId`
      ),
    };
  }

  public static canParse(value: unknown): boolean {
    try {
      const parsed = DamFieldMappingParser.parseJson(value);

      if (!DamFieldMappingParser.isRecord(parsed)) {
        return false;
      }

      return DamFieldMappingParser.isRecord(
        parsed.inputParameters
      );
    } catch {
      return false;
    }
  }

  public static parse(
    value: unknown
  ): FieldMappingInputParameters {
    const parsed = DamFieldMappingParser.parseJson(value);

    const config = DamFieldMappingParser.requireObject(
      parsed,
      'Field mapping configuration'
    );

    const inputParameters = DamFieldMappingParser.requireObject(
      config.inputParameters,
      'inputParameters'
    );

    const damItems = DamFieldMappingParser.requireItems(
      inputParameters.DamFieldList,
      'DamFieldList'
    );

    const pmItems = DamFieldMappingParser.requireItems(
      inputParameters.PMFieldList,
      'PMFieldList'
    );

    return {
      DamFieldList: {
        items: damItems.map((item, index) =>
          DamFieldMappingParser.parseDamFieldItem(item, index)
        ),
      },

      PMFieldList: {
        items: pmItems.map((item, index) =>
          DamFieldMappingParser.parsePmFieldItem(item, index)
        ),
      },
    };
  }
}
