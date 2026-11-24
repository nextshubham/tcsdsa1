export interface FieldConcatField {
  fieldId: string;
  fieldName: string;
  dataType: string;
  objectType: string;
  fieldLogic: string;
}

export interface FieldConcatOutputField {
  fieldId: string;
  dataType: string;
  objectType: string;
}

export interface FieldConcatInfo {
  separator: string;
  inputConcatFields: FieldConcatField[];
  output: FieldConcatOutputField[];
}
