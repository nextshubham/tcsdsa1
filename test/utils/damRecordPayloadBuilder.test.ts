import { DamRecordPayloadBuilder } from '../../utils/damRecordPayloadBuilder';

describe('DamRecordPayloadBuilder', () => {
  const damField = {
    damContentType: 'MLR Approval Record',
    damProjectTitleFieldId: 'title-field-id',
    damClassificationId: 'classification-id',
  };

  it('builds a draft, no-file DAM record payload with project title and classification', () => {
    const result = DamRecordPayloadBuilder.buildPayload(
      damField,
      'Sample PM Project',
      'en-US'
    );

    expect(result).toEqual({
      status: 'draft',
      contentType: 'MLR Approval Record',
      fields: {
        addOrUpdate: [
          {
            id: 'title-field-id',
            localizedValues: [{ languageId: 'en-US', value: 'Sample PM Project' }],
          },
        ],
      },
      classifications: { addOrUpdate: [{ id: 'classification-id' }] },
    });
  });

  it('supports an explicitly provided DAM status', () => {
    expect(DamRecordPayloadBuilder.buildPayload(
      damField,
      'Sample PM Project',
      'en-US',
      'approved'
    ).status).toBe('approved');
  });

  it('produces one payload for every DamFieldList item', () => {
    const configuration = {
      DamFieldList: {
        items: [
          damField,
          { ...damField, damContentType: 'Other Asset Type', damClassificationId: 'another-id' },
        ],
      },
      PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
    };
    const payloads = DamRecordPayloadBuilder.buildPayloads(
      configuration,
      'Sample PM Project',
      'en-US'
    );
    expect(payloads).toHaveLength(2);
    expect(payloads[0].contentType).toBe('MLR Approval Record');
    expect(payloads[1].contentType).toBe('Other Asset Type');
  });

  it('does not include the PM asset type ID in the DAM record POST payload', () => {
    const payload = DamRecordPayloadBuilder.buildPayload(damField, 'A', 'en-US');
    expect(JSON.stringify(payload)).not.toContain('pmDigitalAssetTypeId');
  });

  it('rejects an empty DAM content type', () => {
    expect(() => DamRecordPayloadBuilder.buildPayload(
      { ...damField, damContentType: '' },
      'Sample PM Project',
      'en-US'
    )).toThrow();
  });

  it('rejects an empty project title', () => {
    expect(() => DamRecordPayloadBuilder.buildPayload(damField, '  ', 'en-US')).toThrow();
  });

  it('rejects an empty language ID', () => {
    expect(() => DamRecordPayloadBuilder.buildPayload(damField, 'Project', '')).toThrow();
  });

  it('rejects a missing classification ID', () => {
    expect(() => DamRecordPayloadBuilder.buildPayload(
      { ...damField, damClassificationId: '' },
      'Project',
      'en-US'
    )).toThrow();
  });

  it('rejects a missing project-title field ID', () => {
    expect(() => DamRecordPayloadBuilder.buildPayload(
      { ...damField, damProjectTitleFieldId: '' },
      'Project',
      'en-US'
    )).toThrow();
  });
});
