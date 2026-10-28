
export interface DamFieldMappingItem {
  damContentType: string;
  damProjectTitleFieldId: string;
  damClassificationId: string;
}

export interface PmFieldMappingItem {
  pmDigitalAssetTypeId: string;
}

export interface FieldMappingInputParameters {
  DamFieldList: {
    items: DamFieldMappingItem[];
  };
  PMFieldList: {
    items: PmFieldMappingItem[];
  };
}

export interface FieldMappingInputParametersConfig {
  inputParameters: FieldMappingInputParameters;
}

export type ResolvedProjectConfiguration =
  | {
      format: 'CLASSIFICATION';
      data: InputParameterResolutionResult;
    }
  | {
      format: 'FIELD_MAPPING';
      data: FieldMappingInputParameters;
    };
