import { ProjectConfigurationResolver } from '../../utils/projectConfigurationResolver';
import { InputParameterParser } from '../../utils/inputParameterParser';
import { DamFieldMappingParser } from '../../utils/damFieldMappingParser';
import { DamRecordPayloadBuilder } from '../../utils/damRecordPayloadBuilder';
import logger from '../../utils/logger';
import type { PmExtendedAttribute, PmProjectDetails } from '../../models/pmClassification';
import type { MappingConfiguration } from '../../models/createDamRecordWorkflow';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
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

const attrs: PmExtendedAttribute[] = [
  { eaId: 9001, eaValue: '{"inputParameters":{}}' },
  { eaId: 9002, eaValue: '{"InputParameters":[]}' },
];
const mapping = {
  DamFieldList: {
    items: [{ damContentType: 'MLR Approval Record', damProjectTitleFieldId: 'field-id', damClassificationId: 'class-id' }],
  },
  PMFieldList: { items: [{ pmDigitalAssetTypeId: '1701' }] },
} as MappingConfiguration;
const legacy = { inputParameterEaId: 9002, inputParameters: [{ ExtAttrID: 1 }], resolvedBy: 'explicit' };
const context = { projectId: 274801, taskId: 2301827, environment: 'development' };
const project = { projectName: 'Test PM Project', extendedAttributes: attrs } as PmProjectDetails;
const canParse = DamFieldMappingParser.canParse as jest.Mock;
const parse = DamFieldMappingParser.parse as jest.Mock;
const legacyResolve = InputParameterParser.resolveInputParameters as jest.Mock;
const builder = DamRecordPayloadBuilder.buildPayloads as jest.Mock;
const info = logger.info as jest.Mock;
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv, NODE_ENV: 'development', APRIMO_DAM_LANGUAGE_ID: '1033' };
  delete process.env.INPUT_PARAMETER_EA_ID;
  delete process.env.LOG_DAM_RECORD_PAYLOAD;
  canParse.mockReturnValue(false);
  parse.mockReturnValue(mapping);
  legacyResolve.mockReturnValue(legacy);
  builder.mockReturnValue([{ status: 'draft', contentType: 'MLR Approval Record' }]);
});
afterAll(() => { process.env = originalEnv; });

describe('ProjectConfigurationResolver', () => {
  it('uses the explicitly selected extended attribute for new FIELD_MAPPING format', () => {
    canParse.mockImplementation((value: unknown) => value === attrs[0].eaValue);
    expect(ProjectConfigurationResolver.resolveConfiguration(attrs, 9001))
      .toEqual({ format: 'FIELD_MAPPING', data: mapping });
    expect(parse).toHaveBeenCalledWith(attrs[0].eaValue);
    expect(legacyResolve).not.toHaveBeenCalled();
  });

  it('uses INPUT_PARAMETER_EA_ID when no ID is passed', () => {
    process.env.INPUT_PARAMETER_EA_ID = '9001';
    canParse.mockReturnValue(true);
    ProjectConfigurationResolver.resolveConfiguration(attrs);
    expect(parse).toHaveBeenCalledWith(attrs[0].eaValue);
  });

  it('preserves legacy resolution for selected non-mapping attributes', () => {
    expect(ProjectConfigurationResolver.resolveConfiguration(attrs, 9002))
      .toEqual({ format: 'CLASSIFICATION', data: legacy });
    expect(legacyResolve).toHaveBeenCalledWith(attrs, 9002);
  });

  it('checks the legacy auto-detection path first', () => {
    expect(ProjectConfigurationResolver.resolveConfiguration(attrs))
      .toEqual({ format: 'CLASSIFICATION', data: legacy });
    expect(legacyResolve).toHaveBeenCalledWith(attrs);
    expect(parse).not.toHaveBeenCalled();
  });

  it('auto-detects exactly one field mapping if legacy resolution fails', () => {
    legacyResolve.mockImplementation(() => { throw new Error('No legacy format'); });
    canParse.mockImplementation((value: unknown) => value === attrs[0].eaValue);
    expect(ProjectConfigurationResolver.resolveConfiguration(attrs))
      .toEqual({ format: 'FIELD_MAPPING', data: mapping });
  });

  it('rejects multiple auto-detected mappings instead of choosing one silently', () => {
    legacyResolve.mockImplementation(() => { throw new Error('No legacy format'); });
    canParse.mockReturnValue(true);
    expect(() => ProjectConfigurationResolver.resolveConfiguration(attrs))
      .toThrow('Multiple field mapping configurations found');
    expect(parse).not.toHaveBeenCalled();
  });

  it('preserves the original legacy error if neither format matches', () => {
    legacyResolve.mockImplementation(() => { throw new Error('InputParameters missing'); });
    expect(() => ProjectConfigurationResolver.resolveConfiguration(attrs))
      .toThrow('InputParameters missing');
  });

  it('uses the first non-empty project title in priority order', () => {
    const projectWithSeveralTitles = {
      projectTitle: ' ', projectName: ' PM Project ', name: 'Other', title: 'Last', extendedAttributes: attrs,
    } as PmProjectDetails;
    expect(ProjectConfigurationResolver.getProjectTitle(projectWithSeveralTitles)).toBe('PM Project');
    expect(ProjectConfigurationResolver.getProjectTitle({ title: 'Fallback' } as PmProjectDetails))
      .toBe('Fallback');
  });

  it('rejects a project without a usable title', () => {
    expect(() => ProjectConfigurationResolver.getProjectTitle({ projectName: '  ' } as PmProjectDetails))
      .toThrow('PM project title not found');
  });

  it('accepts a numeric Aprimo language ID stored as a string', () => {
    expect(ProjectConfigurationResolver.getDamLanguageId()).toBe('1033');
  });

  it('rejects a missing Aprimo language ID', () => {
    delete process.env.APRIMO_DAM_LANGUAGE_ID;
    expect(() => ProjectConfigurationResolver.getDamLanguageId())
      .toThrow('APRIMO_DAM_LANGUAGE_ID is not configured');
  });

  it('builds a DAM payload using project title and configured language ID', () => {
    const output = ProjectConfigurationResolver.buildPayloads(mapping, project, context);
    expect(builder).toHaveBeenCalledWith(mapping, 'Test PM Project', '1033');
    expect(output).toEqual([{ status: 'draft', contentType: 'MLR Approval Record' }]);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'DAM record payloads built successfully' }));
  });

  it('logs payload previews only when explicitly enabled in development', () => {
    ProjectConfigurationResolver.buildPayloads(mapping, project, context);
    expect(info).not.toHaveBeenCalledWith(expect.objectContaining({ msg: 'DAM record payload preview' }));
    process.env.LOG_DAM_RECORD_PAYLOAD = 'true';
    ProjectConfigurationResolver.buildPayloads(mapping, project, context);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ msg: 'DAM record payload preview' }));
  });
});
