import { FieldConcatActivityIdResolver } from '../../../modules/field-concatenation/utils/FieldConcatActivityIdResolver';

describe('FieldConcatActivityIdResolver', () => {
  it('uses the task-linked activity', () => {
    expect(FieldConcatActivityIdResolver.resolve(
      { activities: [{ id: 1 }, { id: 2 }] },
      { activityId: '2' }
    )).toBe(2);
  });

  it('uses a direct project activity ID', () => {
    expect(FieldConcatActivityIdResolver.resolve(
      { activityId: 321 }, {}
    )).toBe(321);
  });

  it('uses a single embedded project activity', () => {
    expect(FieldConcatActivityIdResolver.resolve(
      { _embedded: { activities: [{ id: 888 }] } }, {}
    )).toBe(888);
  });

  it('rejects ambiguous projects rather than selecting the first activity', () => {
    expect(() => FieldConcatActivityIdResolver.resolve(
      { activities: [{ id: 1 }, { id: 2 }] }, {}
    )).toThrow(/ambiguous/);
  });

  it('rejects inconsistent task and project activity IDs', () => {
    expect(() => FieldConcatActivityIdResolver.resolve(
      { activityId: 2 }, { activityId: 3 }
    )).toThrow(/different activity IDs/);
  });
});
