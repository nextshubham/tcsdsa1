import { CreateDamRecordService } from '../../services/CreateDamRecordService';
import { DamRecordService } from '../../services/damRecordService';
import { PmDigitalAssetService } from '../../services/pmDigitalAssetService';
import { PmProjectService } from '../../services/pmProjectService';
import { InputParameterParser } from '../../utils/inputParameterParser';
import { DamFieldMappingParser } from '../../utils/damFieldMappingParser';
import { DamRecordPayloadBuilder } from '../../utils/damRecordPayloadBuilder';
import logger from '../../utils/logger';

jest.mock('../../services/pmProjectService', () => ({
  PmProjectService: { getProjectDetails: jest.fn() },
}));
jest.mock('../../services/damRecordService', () => ({
  DamRecordService: { createDamRecord: jest.fn() },
}));
jest.mock('../../services/pmDigitalAssetService', () => ({
  PmDigitalAssetService: {
    createDamMapping: jest.fn(),
    associateAssetWithProject: jest.fn(),
  },
}));
jest.mock('../../utils/inputParameterParser', () => ({
  InputParameterParser: { resolveInputParameters: jest.fn() },
}));
jest.mock('../../utils/damFieldMappingParser', () => ({
  DamFieldMappingParser: { canParse: jest.fn(), parse: jest.fn() },
}));
jest.mock('../../utils/damRecordPayloadBuilder', () => ({
  DamRecordPayloadBuilder: { buildPayloads: jest.fn() },
}));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('CreateDamRecordService - latest controlled webhook workflow', () => {
  const getProjectDetails = PmProjectService.getProjectDetails as jest.Mock;
  const createDamRecord = DamRecordService.createDamRecord as jest.Mock;
  const createDamMapping = PmDigitalAssetService.createDamMapping as jest.Mock;
  const associateAssetWithProject = PmDigitalAssetService.associateAssetWithProject as jest.Mock;
  const canParseMapping = DamFieldMappingParser.canParse as jest.Mock;
  const parseMapping = DamFieldMappingParser.parse as jest.Mock;
  const resolveLegacy = InputParameterParser.resolveInputParameters as jest.Mock;
  const buildPayloads = DamRecordPayloadBuilder.buildPayloads as jest.Mock;

  const projectId = 42;
  const taskId = 77;
  const environment = 'development';
  const eaValue = JSON.stringify({ inputParameters: { DamFieldList: {}, PMFieldList: {} } });
  const mappingConfig = {
    DamFieldList: { items: [{
      damContentType: 'MLR Approval Record',
      damProjectTitleFieldId: 'dam-title-field',
      damClassificationId: 'dam-classification',
    }] },
    PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
  };
  const payload = {
    status: 'draft',
    contentType: 'MLR Approval Record',
    fields: { addOrUpdate: [{
      id: 'dam-title-field',
      localizedValues: [{ languageId: 'en-US', value: 'Test PM Project' }],
    }] },
    classifications: { addOrUpdate: [{ id: 'dam-classification' }] },
  };

  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    INPUT_PARAMETER_EA_ID: process.env.INPUT_PARAMETER_EA_ID,
    APRIMO_DAM_LANGUAGE_ID: process.env.APRIMO_DAM_LANGUAGE_ID,
    ENABLE_DAM_RECORD_CREATION: process.env.ENABLE_DAM_RECORD_CREATION,
    ENABLE_PM_DAM_MAPPING: process.env.ENABLE_PM_DAM_MAPPING,
    ENABLE_PM_PROJECT_ASSOCIATION: process.env.ENABLE_PM_PROJECT_ASSOCIATION,
    DAM_CREATE_TEST_PROJECT_ID: process.env.DAM_CREATE_TEST_PROJECT_ID,
    PM_DAM_MAPPING_TEST_RECORD_ID: process.env.PM_DAM_MAPPING_TEST_RECORD_ID,
    PM_PROJECT_ASSOCIATION_TEST_ASSET_ID: process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID,
    LOG_DAM_RECORD_PAYLOAD: process.env.LOG_DAM_RECORD_PAYLOAD,
  };

  const assertNoWrites = (): void => {
    expect(createDamRecord).not.toHaveBeenCalled();
    expect(createDamMapping).not.toHaveBeenCalled();
    expect(associateAssetWithProject).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(process.env, {
      NODE_ENV: 'development',
      INPUT_PARAMETER_EA_ID: '9001',
      APRIMO_DAM_LANGUAGE_ID: 'en-US',
      ENABLE_DAM_RECORD_CREATION: 'false',
      ENABLE_PM_DAM_MAPPING: 'false',
      ENABLE_PM_PROJECT_ASSOCIATION: 'false',
      DAM_CREATE_TEST_PROJECT_ID: String(projectId),
      PM_DAM_MAPPING_TEST_RECORD_ID: 'existing-dam-record-id',
      PM_PROJECT_ASSOCIATION_TEST_ASSET_ID: '357401',
      LOG_DAM_RECORD_PAYLOAD: 'false',
    });
    getProjectDetails.mockResolvedValue({
      projectId,
      projectTitle: 'Test PM Project',
      extendedAttributes: [{ eaId: 9001, eaValue }],
    });
    canParseMapping.mockImplementation((value: unknown) => value === eaValue);
    parseMapping.mockReturnValue(mappingConfig);
    buildPayloads.mockReturnValue([payload]);
    createDamRecord.mockResolvedValue({ recordId: 'new-dam-record-id', statusCode: 201 });
    createDamMapping.mockResolvedValue({ assetId: 357401, versionId: 365301 });
    associateAssetWithProject.mockResolvedValue(undefined);
  });

  afterAll(() => {
    Object.entries(savedEnv).forEach(([name, value]) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  });

  it('builds a field-mapping payload without making writes in dry-run mode', async () => {
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(getProjectDetails).toHaveBeenCalledWith(projectId, environment);
    expect(parseMapping).toHaveBeenCalledWith(eaValue);
    expect(buildPayloads).toHaveBeenCalledWith(mappingConfig, 'Test PM Project', 'en-US');
    expect(result.format).toBe('FIELD_MAPPING');
    if (result.format === 'FIELD_MAPPING') {
      expect(result.damRecordPayloads).toEqual([payload]);
      expect(result.createdDamRecords).toBeUndefined();
      expect(result.pmDamMappings).toBeUndefined();
      expect(result.pmProjectAssociations).toBeUndefined();
    }
    assertNoWrites();
  });

  it('creates only one DAM record when the creation test flag is enabled', async () => {
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(createDamRecord).toHaveBeenCalledTimes(1);
    expect(createDamRecord).toHaveBeenCalledWith(payload);
    expect(createDamMapping).not.toHaveBeenCalled();
    expect(associateAssetWithProject).not.toHaveBeenCalled();
    if (result.format === 'FIELD_MAPPING') {
      expect(result.createdDamRecords).toEqual([
        { recordId: 'new-dam-record-id', statusCode: 201 },
      ]);
    }
  });

  it('maps only the pre-existing DAM record when the mapping flag is enabled', async () => {
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(createDamMapping).toHaveBeenCalledWith('existing-dam-record-id', '1701');
    expect(createDamRecord).not.toHaveBeenCalled();
    expect(associateAssetWithProject).not.toHaveBeenCalled();
    if (result.format === 'FIELD_MAPPING') {
      expect(result.pmDamMappings).toEqual([{
        damRecordId: 'existing-dam-record-id', assetId: 357401, versionId: 365301,
      }]);
    }
  });

  it('associates only the existing PM asset with the webhook project', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(associateAssetWithProject).toHaveBeenCalledTimes(1);
    expect(associateAssetWithProject).toHaveBeenCalledWith(projectId, 357401);
    expect(createDamRecord).not.toHaveBeenCalled();
    expect(createDamMapping).not.toHaveBeenCalled();
    if (result.format === 'FIELD_MAPPING') {
      expect(result.pmProjectAssociations).toEqual([{ projectId, assetId: 357401 }]);
    }
  });

  it('rejects simultaneous DAM creation and PM mapping before writing anything', async () => {
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Disable DAM creation when testing PM DAM mapping');
    assertNoWrites();
  });

  it('rejects association plus DAM creation before writing anything', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.ENABLE_DAM_RECORD_CREATION = 'true';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Disable DAM creation and PM DAM mapping when testing project association');
    assertNoWrites();
  });

  it('rejects association plus mapping before writing anything', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Disable DAM creation and PM DAM mapping when testing project association');
    assertNoWrites();
  });

  it('rejects association for an unapproved test project', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.DAM_CREATE_TEST_PROJECT_ID = '999';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('PM Project association is not enabled for this test project');
    assertNoWrites();
  });

  it('rejects controlled association outside development', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.NODE_ENV = 'production';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Controlled PM Project association is only allowed in development');
    assertNoWrites();
  });

  it('rejects an invalid configured PM association test asset ID', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    process.env.PM_PROJECT_ASSOCIATION_TEST_ASSET_ID = 'not-numeric';
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('PM_PROJECT_ASSOCIATION_TEST_ASSET_ID must be a positive integer');
    assertNoWrites();
  });

  it('rejects multiple DAM payloads for a controlled write', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    buildPayloads.mockReturnValue([payload, payload]);
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Controlled integration test requires exactly one DAM payload');
    assertNoWrites();
  });

  it('rejects mapping when PM_DAM_MAPPING_TEST_RECORD_ID is missing', async () => {
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    delete process.env.PM_DAM_MAPPING_TEST_RECORD_ID;
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('PM_DAM_MAPPING_TEST_RECORD_ID is not configured');
    assertNoWrites();
  });

  it('rejects mapping when multiple PMFieldList items are configured', async () => {
    process.env.ENABLE_PM_DAM_MAPPING = 'true';
    parseMapping.mockReturnValue({
      ...mappingConfig,
      PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }, { pmDigitalAssetTypeId: '1702' }] },
    });
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Controlled PM DAM mapping requires exactly one PMFieldList item');
    assertNoWrites();
  });

  it('propagates and logs a PM association service failure', async () => {
    process.env.ENABLE_PM_PROJECT_ASSOCIATION = 'true';
    associateAssetWithProject.mockRejectedValueOnce(new Error('PM association failed'));
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('PM association failed');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'Create DAM Record project processing failed',
    }));
  });

  it('rejects invalid webhook identifiers before fetching PM details', async () => {
    await expect(CreateDamRecordService.resolveProjectInputParameters(0, taskId, environment))
      .rejects.toThrow('Invalid projectId');
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, 0, environment))
      .rejects.toThrow('Invalid taskId');
    expect(getProjectDetails).not.toHaveBeenCalled();
  });

  it('rejects a missing environment before fetching PM details', async () => {
    await expect(CreateDamRecordService.resolveProjectInputParameters(projectId, taskId, ''))
      .rejects.toThrow('Environment is required');
    expect(getProjectDetails).not.toHaveBeenCalled();
  });

  it('preserves the legacy CLASSIFICATION workflow without making new writes', async () => {
    canParseMapping.mockReturnValue(false);
    resolveLegacy.mockReturnValue({
      inputParameterEaId: 9001,
      inputParameters: [{ ExtAttrID: '100', ObjectType: 'Project', ParentNamePath: 'A' }],
      resolvedBy: 'ENV',
    });
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(result.format).toBe('CLASSIFICATION');
    expect(resolveLegacy).toHaveBeenCalledTimes(1);
    expect(buildPayloads).not.toHaveBeenCalled();
    assertNoWrites();
  });

  it('auto-detects a unique FIELD_MAPPING EA when the legacy parser fails', async () => {
    delete process.env.INPUT_PARAMETER_EA_ID;
    resolveLegacy.mockImplementation(() => { throw new Error('No old input parameters'); });
    const result = await CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    );
    expect(result.format).toBe('FIELD_MAPPING');
    expect(parseMapping).toHaveBeenCalledWith(eaValue);
    assertNoWrites();
  });

  it('throws when the PM project lacks extendedAttributes', async () => {
    getProjectDetails.mockResolvedValueOnce({ projectTitle: 'Missing extended attributes' });
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('Project extendedAttributes are required');
    assertNoWrites();
  });

  it('throws when the PM project title is unavailable for FIELD_MAPPING', async () => {
    getProjectDetails.mockResolvedValueOnce({
      extendedAttributes: [{ eaId: 9001, eaValue }],
    });
    await expect(CreateDamRecordService.resolveProjectInputParameters(
      projectId, taskId, environment
    )).rejects.toThrow('PM project title not found in project details');
    assertNoWrites();
  });
});
