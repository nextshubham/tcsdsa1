import { PmProjectService } from '../../../services/pmProjectService';
import { FieldConcatenationService } from '../../../modules/field-concatenation/services/FieldConcatenationService';

jest.mock('../../../services/pmProjectService', () => ({
  PmProjectService: { getProjectDetails: jest.fn() },
}));

describe('FieldConcatenationService', () => {
  const getProjectDetails = PmProjectService.getProjectDetails as jest.Mock;
  const oldInputId = process.env.INPUT_PARAMETER_EA_ID;
  const oldOutputId = process.env.OUTPUT_PARAMETER_EA_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INPUT_PARAMETER_EA_ID = '20';
    process.env.OUTPUT_PARAMETER_EA_ID = '30';
  });

  afterAll(() => {
    if (oldInputId === undefined) delete process.env.INPUT_PARAMETER_EA_ID;
    else process.env.INPUT_PARAMETER_EA_ID = oldInputId;

    if (oldOutputId === undefined) delete process.env.OUTPUT_PARAMETER_EA_ID;
    else process.env.OUTPUT_PARAMETER_EA_ID = oldOutputId;
  });

  it('fetches PM project details and resolves input and output EAs', async () => {
    getProjectDetails.mockResolvedValue({
      extendedAttributes: [
        {
          eaId: 20,
          eaValue:
            "'_',20401|Brand|PicklistEA|Activity|UseMappingSheet,GLOBAL||NA|Constant|",
        },
        { eaId: 30, eaValue: '50001|TextEA|Project' },
      ],
    });

    const result = await FieldConcatenationService.resolveProjectConfiguration(
      1000,
      87701,
      'development'
    );

    expect(getProjectDetails).toHaveBeenCalledWith(1000, 'development');
    expect(result.config.inputConcatFields).toHaveLength(2);
    expect(result.config.output).toHaveLength(1);
    expect(result.config.separator).toBe('_');
  });

  it('rejects absent input EA configuration', async () => {
    getProjectDetails.mockResolvedValue({ extendedAttributes: [] });

    await expect(
      FieldConcatenationService.resolveProjectConfiguration(
        1000,
        87701,
        'development'
      )
    ).rejects.toThrow('FCU configuration EA not found for ID: 20');
  });

  it('requires the output EA environment ID before any PM API call', async () => {
    delete process.env.OUTPUT_PARAMETER_EA_ID;

    await expect(
      FieldConcatenationService.resolveProjectConfiguration(
        1000,
        87701,
        'development'
      )
    ).rejects.toThrow('OUTPUT_PARAMETER_EA_ID is not configured');

    expect(getProjectDetails).not.toHaveBeenCalled();
  });

  it('rejects missing output EA values', async () => {
    getProjectDetails.mockResolvedValue({
      extendedAttributes: [
        { eaId: 20, eaValue: '-,GLOBAL||NA|Constant' },
        { eaId: 30, eaValue: '' },
      ],
    });

    await expect(
      FieldConcatenationService.resolveProjectConfiguration(
        1000,
        87701,
        'development'
      )
    ).rejects.toThrow('FCU output concatenation configuration is missing');
  });
});
