
import type {
  DamFieldMappingItem,
  FieldMappingInputParameters,
} from '../models/pmClassification';

export interface DamRecordPayload {
  status: string;
  contentType: string;
  fields: {
    addOrUpdate: {
      id: string;
      localizedValues: {
        languageId: string;
        value: string;
      }[];
    }[];
  };
  classifications: {
    addOrUpdate: {
      id: string;
    }[];
  };
}

export class DamRecordPayloadBuilder {
  private static requireString(
    value: unknown,
    fieldName: string
  ): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${fieldName} is required`);
    }

    return value.trim();
  }

  public static buildPayload(
    damField: DamFieldMappingItem,
    projectTitle: string,
    languageId: string,
    status: string = 'draft'
  ): DamRecordPayload {
    if (!damField) {
      throw new Error('DAM field mapping is required');
    }

    const contentType = DamRecordPayloadBuilder.requireString(
      damField.damContentType,
      'damContentType'
    );

    const projectTitleFieldId =
      DamRecordPayloadBuilder.requireString(
        damField.damProjectTitleFieldId,
        'damProjectTitleFieldId'
      );

    const classificationId =
      DamRecordPayloadBuilder.requireString(
        damField.damClassificationId,
        'damClassificationId'
      );

    const title = DamRecordPayloadBuilder.requireString(
      projectTitle,
      'projectTitle'
    );

    const resolvedLanguageId =
      DamRecordPayloadBuilder.requireString(
        languageId,
        'languageId'
      );

    const resolvedStatus =
      DamRecordPayloadBuilder.requireString(
        status,
        'status'
      );

    return {
      status: resolvedStatus,
      contentType,
      fields: {
        addOrUpdate: [
          {
            id: projectTitleFieldId,
            localizedValues: [
              {
                languageId: resolvedLanguageId,
                value: title,
              },
            ],
          },
        ],
      },
      classifications: {
        addOrUpdate: [
          {
            id: classificationId,
          },
        ],
      },
    };
  }

  public static buildPayloads(
    configuration: FieldMappingInputParameters,
    projectTitle: string,
    languageId: string,
    status: string = 'draft'
  ): DamRecordPayload[] {
    const damFields = configuration?.DamFieldList?.items;

    if (!Array.isArray(damFields) || damFields.length === 0) {
      throw new Error(
        'DamFieldList.items must be a non-empty array'
      );
    }

    return damFields.map((damField) =>
      DamRecordPayloadBuilder.buildPayload(
        damField,
        projectTitle,
        languageId,
        status
      )
    );
  }
}
