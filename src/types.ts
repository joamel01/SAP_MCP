export type SupportedObjectType =
  | "functiongroup"
  | "functionmodule"
  | "interface"
  | "class"
  | "program"
  | "ddls"
  | "bdef"
  | "dcls"
  | "ddlx";

export type DeletableObjectType =
  | SupportedObjectType
  | "package"
  | "dataelement"
  | "domain"
  | "table"
  | "structure"
  | "tabletype";

export interface ObjectUriTemplate {
  label: string;
  uriTemplate: string;
}

export type ObjectUriTemplateMap = Record<string, ObjectUriTemplate>;

export interface ServerConfig {
  adtBaseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  verifyTls: boolean;
  defaultTransportRequest?: string;
  allowedPackages: string[];
  allowedObjectTypes: SupportedObjectType[];
  uriTemplates: ObjectUriTemplateMap;
  defaultMasterSystem: string;
  defaultAbapLanguageVersion: string;
  defaultSoftwareComponent: string;
  defaultSoftwareComponentDescription: string;
}

export interface AdtResponseSummary {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface AdtLockResult {
  lockHandle: string;
  transportRequest?: string;
  transportUser?: string;
  transportText?: string;
  isLocal?: string;
  rawBody: string;
}

export interface AdtActivationRequest {
  objectType?: SupportedObjectType;
  objectName?: string;
  containerName?: string;
  uri?: string;
  name?: string;
  type?: string;
  parentUri?: string;
}

export interface AdtCreatePackageInput {
  packageName: string;
  description: string;
  packageType: "development" | "structure";
  superPackage?: string;
  recordChanges: boolean;
  softwareComponent: string;
  softwareComponentDescription: string;
}

export interface AdtCreateFunctionGroupInput {
  groupName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateFunctionModuleInput {
  groupName: string;
  functionModuleName: string;
  description: string;
  packageName: string;
  transportRequest?: string;
}

export interface AdtCreateTransportRequestInput {
  description: string;
  requestType: "K" | "W";
  owner?: string;
  target?: string;
  sourceClient?: string;
}

export interface AdtCreateTransactionInput {
  transactionCode: string;
  programName: string;
  shortText: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
  variant?: string;
  helperClassName?: string;
  deleteHelperAfterRun?: boolean;
}

export interface AdtDeleteTransactionInput {
  transactionCode: string;
  helperPackageName: string;
  masterSystem?: string;
  transportRequest?: string;
  helperClassName?: string;
  deleteHelperAfterRun?: boolean;
}

export interface AdtUserParameterEntryInput {
  parameterId: string;
  value: string;
  text?: string;
}

export interface AdtGetUserParametersInput {
  helperPackageName: string;
  userName?: string;
  parameterIds?: string[];
  withText?: boolean;
  masterSystem?: string;
  transportRequest?: string;
  helperClassName?: string;
  deleteHelperAfterRun?: boolean;
}

export interface AdtSetUserParametersInput {
  helperPackageName: string;
  userName?: string;
  parameters: AdtUserParameterEntryInput[];
  masterSystem?: string;
  transportRequest?: string;
  helperClassName?: string;
  deleteHelperAfterRun?: boolean;
}

export interface AdtListTransportRequestsInput {
  requestStatus?: "D" | "R";
  requestType?: "K" | "W";
  owner?: string;
}

export interface AdtGetTransportRequestInput {
  requestNumber: string;
}

export interface AdtReleaseTransportRequestInput {
  requestNumber: string;
  mode?: "standard" | "ignoreLocks" | "ignoreWarnings" | "ignoreAtc";
}

export interface AdtDeleteTransportRequestInput {
  requestNumber: string;
}

export interface AdtSafeReleaseTransportRequestInput {
  requestNumber: string;
  releaseTasksFirst?: boolean;
  failOnInactiveObjects?: boolean;
}

export interface AdtCreateProgramInput {
  programName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  abapLanguageVersion: string;
  transportRequest?: string;
}

export interface AdtCreateClassInput {
  className: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateInterfaceInput {
  interfaceName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateDdlsInput {
  ddlName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateBdefInput {
  bdefName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateDclsInput {
  dclName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateDdlxInput {
  ddlxName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateDataElementInput {
  dataElementName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  domainName: string;
  shortFieldLabel: string;
  mediumFieldLabel: string;
  longFieldLabel: string;
  headingFieldLabel: string;
  defaultComponentName: string;
  transportRequest?: string;
}

export interface AdtCreateTableInput {
  tableName: string;
  description: string;
  packageName: string;
  source: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtCreateTableTypeInput {
  tableTypeName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  rowTypeName: string;
  accessType: "standard" | "sorted" | "hashed" | "index";
  transportRequest?: string;
}

export interface AdtCreateDomainInput {
  domainName: string;
  description: string;
  packageName: string;
  masterSystem: string;
  dataType: string;
  length: string;
  decimals?: string;
  outputLength?: string;
  lowercase?: boolean;
  valueTableName?: string;
  fixedValues?: AdtDomainFixedValue[];
  transportRequest?: string;
}

export interface AdtCreateStructureInput {
  structureName: string;
  description: string;
  packageName: string;
  source: string;
  masterSystem: string;
  transportRequest?: string;
}

export interface AdtReadSearchHelpInput {
  searchHelpName: string;
}

export interface AdtCreateSearchHelpInput {
  searchHelpName: string;
  description: string;
  packageName: string;
  selectionMethod: string;
  keyFieldName: string;
  helperProgramName?: string;
  masterSystem: string;
  abapLanguageVersion: string;
  transportRequest?: string;
  deleteHelperAfterRun?: boolean;
}

export interface AdtDomainFixedValue {
  low?: string;
  high?: string;
  text: string;
  position?: string;
}

export interface AdtRunProgramInput {
  programName: string;
  profilerId?: string;
}

export interface AdtRunClassInput {
  className: string;
  profilerId?: string;
}

export interface AdtRunAbapUnitInput {
  objectType: "class" | "program";
  objectName?: string;
  uri?: string;
  assignedTests?: boolean;
  sameProgram?: boolean;
  withNavigationUri?: boolean;
  harmlessRiskLevel?: boolean;
  dangerousRiskLevel?: boolean;
  criticalRiskLevel?: boolean;
  shortDuration?: boolean;
  mediumDuration?: boolean;
  longDuration?: boolean;
}

export interface AdtDependencyObjectInput {
  objectType: SupportedObjectType;
  objectName?: string;
  containerName?: string;
  uri?: string;
  packageName?: string;
}

export interface AdtActivateDependencyChainInput {
  orderProfile?: "auto" | "consumerProgram" | "consumptionView";
  objects: AdtDependencyObjectInput[];
}

export interface AdtActivateObjectSetInput {
  orderProfile?: "auto" | "consumerProgram" | "consumptionView";
  stopOnError?: boolean;
  objects: AdtDependencyObjectInput[];
}

export interface AdtDeleteObjectInput {
  objectType: DeletableObjectType;
  objectName?: string;
  containerName?: string;
  uri?: string;
  transportRequest?: string;
}

export interface AdtCreateScaffoldInput {
  packageName: string;
  createPackage?: boolean;
  packageDescription?: string;
  programName: string;
  className: string;
  ddlName: string;
  descriptionPrefix?: string;
  sourceTableName: string;
  masterSystem: string;
  abapLanguageVersion: string;
  transportRequest?: string;
}
