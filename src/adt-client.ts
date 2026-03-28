import { Agent } from "undici";
import type {
  AdtActivationRequest,
  AdtActivateDependencyChainInput,
  AdtActivateObjectSetInput,
  AdtCreateBdefInput,
  AdtCreateClassInput,
  AdtCreateDclsInput,
  AdtCreateDataElementInput,
  AdtCreateDdlsInput,
  AdtCreateDdlxInput,
  AdtCreateDomainInput,
  AdtCreateFunctionGroupInput,
  AdtCreateFunctionModuleInput,
  AdtCreateInterfaceInput,
  AdtCreatePackageInput,
  AdtCreateProgramInput,
  AdtCreateSearchHelpInput,
  AdtCreateScaffoldInput,
  AdtCreateTransactionInput,
  AdtCreateTransportRequestInput,
  AdtDeleteTransactionInput,
  AdtDeleteTransportRequestInput,
  AdtGetUserParametersInput,
  AdtGetTransportRequestInput,
  AdtListTransportRequestsInput,
  AdtReleaseTransportRequestInput,
  AdtSafeReleaseTransportRequestInput,
  AdtRunClassInput,
  AdtRunProgramInput,
  AdtReadSearchHelpInput,
  AdtSetUserParametersInput,
  AdtSyntaxCheckObjectInput,
  AdtSyntaxCheckSourceInput,
  AdtCreateStructureInput,
  AdtCreateTableInput,
  AdtCreateTableTypeInput,
  AdtDeleteObjectInput,
  AdtDependencyObjectInput,
  AdtLockObjectInput,
  AdtRunAbapUnitInput,
  AdtUnlockObjectInput,
  DeletableObjectType,
  AdtLockResult,
  AdtResponseSummary,
  ServerConfig,
  SupportedObjectType,
} from "./types.js";
import {
  applyTemplate,
  normalizeObjectName,
  parseSyntaxCheckResult,
  parseTagAttributes,
  parseTransportRequestList,
  parseXmlAttribute,
  parseXmlTag,
  trimBody,
  truncateObjectName,
  xmlEscape,
} from "./utils.js";

export interface ReadObjectInput {
  objectType: SupportedObjectType;
  objectName?: string;
  containerName?: string;
  uri?: string;
}

export interface WriteObjectInput extends ReadObjectInput {
  content: string;
  transportRequest?: string;
  activateAfterWrite?: boolean;
}

interface RequestOptions {
  body?: string;
  headers?: Record<string, string>;
  includeAuth?: boolean;
  stateful?: boolean;
  session?: SessionState;
}

interface SessionState {
  csrfToken?: string;
  cookies: Map<string, string>;
}

interface ActivationDiagnosticMessage {
  type: string;
  objectDescription?: string;
  line?: string;
  href?: string;
  shortText: string;
}

interface ActivationDiagnostics {
  category: string;
  summary: string;
  checkExecuted?: string;
  activationExecuted?: string;
  generationExecuted?: string;
  messages: ActivationDiagnosticMessage[];
  resultBody?: string;
}

interface OrderedDependencyObject extends AdtDependencyObjectInput {
  requestedOrder: number;
  executionOrder: number;
}

export class AdtClient {
  private readonly config: ServerConfig;
  private readonly dispatcher: Agent | undefined;
  private readonly statelessSession: SessionState = { cookies: new Map() };
  private readonly statefulSession: SessionState = { cookies: new Map() };

  constructor(config: ServerConfig) {
    this.config = config;

    if (!config.verifyTls) {
      this.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      });
    }
  }

  async discoverSystem(): Promise<AdtResponseSummary> {
    return this.request("GET", "/discovery");
  }

  async readObject(input: ReadObjectInput): Promise<AdtResponseSummary> {
    const uri = this.resolveObjectUri(input.objectType, input.objectName, input.containerName, input.uri);
    return this.request("GET", uri);
  }

  async readSearchHelp(input: AdtReadSearchHelpInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.searchHelpName);
    return this.request(
      "GET",
      `/vit/wb/object_type/shlpdh/object_name/${encodeURIComponent(normalizedName)}`,
    );
  }

  async createSearchHelp(input: AdtCreateSearchHelpInput): Promise<AdtResponseSummary[]> {
    const helperProgramName = truncateObjectName(
      input.helperProgramName ?? `Z_MCP_SHLP_${input.searchHelpName}`,
      30,
    );
    const responses: AdtResponseSummary[] = [];

    try {
      responses.push(await this.createProgram({
        programName: helperProgramName,
        description: `MCP helper for ${normalizeObjectName(input.searchHelpName)}`,
        packageName: input.packageName,
        masterSystem: input.masterSystem,
        abapLanguageVersion: input.abapLanguageVersion,
      }));
    } catch (error) {
      const message = String(error);
      if (!message.includes("already exists")) {
        throw error;
      }
    }

    responses.push(await this.writeObject({
      objectType: "program",
      objectName: helperProgramName,
      content: this.buildSearchHelpHelperProgramSource(input, helperProgramName),
      activateAfterWrite: true,
    }));

    const runResponse = await this.runProgram({ programName: helperProgramName });
    this.ensureSuccess(
      runResponse,
      `Failed to run helper program ${helperProgramName} for search help ${normalizeObjectName(input.searchHelpName)}`,
    );
    responses.push(runResponse);

    if (input.deleteHelperAfterRun) {
      responses.push(await this.deleteObject({
        objectType: "program",
        objectName: helperProgramName,
      }));
    }

    return responses;
  }

  async createTransaction(input: AdtCreateTransactionInput): Promise<AdtResponseSummary[]> {
    const helperClassName = truncateObjectName(
      input.helperClassName ?? `ZCL_MCP_TX_${input.transactionCode}`,
      30,
    );
    const responses: AdtResponseSummary[] = [];

    try {
      responses.push(await this.createClass({
        className: helperClassName,
        description: `MCP helper for ${normalizeObjectName(input.transactionCode)}`,
        packageName: input.packageName,
        masterSystem: input.masterSystem,
        transportRequest: input.transportRequest,
      }));
    } catch (error) {
      const message = String(error);
      if (!message.includes("already_exists")) {
        throw error;
      }
    }

    responses.push(await this.writeObject({
      objectType: "class",
      objectName: helperClassName,
      content: this.buildCreateTransactionHelperClassSource(input, helperClassName),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    const runResponse = await this.runClass({ className: helperClassName });
    this.ensureSuccess(
      runResponse,
      `Failed to run helper class ${helperClassName} for transaction ${normalizeObjectName(input.transactionCode)}`,
    );
    this.ensureTransactionHelperCreateSuccess(input.transactionCode, runResponse.body);
    responses.push(runResponse);

    if (input.deleteHelperAfterRun ?? true) {
      responses.push(await this.deleteObject({
        objectType: "class",
        objectName: helperClassName,
        transportRequest: input.transportRequest,
      }));
    }

    return responses;
  }

  async deleteTransaction(input: AdtDeleteTransactionInput): Promise<AdtResponseSummary[]> {
    const helperClassName = truncateObjectName(
      input.helperClassName ?? `ZCL_MCP_TX_${input.transactionCode}`,
      30,
    );
    const responses: AdtResponseSummary[] = [];

    try {
      responses.push(await this.createClass({
        className: helperClassName,
        description: `MCP helper for ${normalizeObjectName(input.transactionCode)}`,
        packageName: input.helperPackageName,
        masterSystem: input.masterSystem ?? this.config.defaultMasterSystem,
        transportRequest: input.transportRequest,
      }));
    } catch (error) {
      const message = String(error);
      if (!message.includes("already_exists")) {
        throw error;
      }
    }

    responses.push(await this.writeObject({
      objectType: "class",
      objectName: helperClassName,
      content: this.buildDeleteTransactionHelperClassSource(input, helperClassName),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    const runResponse = await this.runClass({ className: helperClassName });
    this.ensureSuccess(
      runResponse,
      `Failed to run helper class ${helperClassName} for transaction delete ${normalizeObjectName(input.transactionCode)}`,
    );
    this.ensureTransactionHelperDeleteSuccess(input.transactionCode, runResponse.body);
    responses.push(runResponse);

    if (input.deleteHelperAfterRun ?? true) {
      responses.push(await this.deleteObject({
        objectType: "class",
        objectName: helperClassName,
        transportRequest: input.transportRequest,
      }));
    }

    return responses;
  }

  async getUserParameters(input: AdtGetUserParametersInput): Promise<AdtResponseSummary[]> {
    const helperClassName = truncateObjectName(
      input.helperClassName ?? `ZCL_MCP_PGET_${input.userName ?? this.config.username}`,
      30,
    );
    const responses: AdtResponseSummary[] = [];

    try {
      responses.push(await this.createClass({
        className: helperClassName,
        description: `MCP helper for user parameters ${normalizeObjectName(input.userName ?? this.config.username)}`,
        packageName: input.helperPackageName,
        masterSystem: input.masterSystem ?? this.config.defaultMasterSystem,
        transportRequest: input.transportRequest,
      }));
    } catch (error) {
      const message = String(error);
      if (!message.includes("already_exists")) {
        throw error;
      }
    }

    responses.push(await this.writeObject({
      objectType: "class",
      objectName: helperClassName,
      content: this.buildGetUserParametersHelperClassSource(input, helperClassName),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    const runResponse = await this.runClass({ className: helperClassName });
    this.ensureSuccess(
      runResponse,
      `Failed to run helper class ${helperClassName} for user parameter read ${normalizeObjectName(input.userName ?? this.config.username)}`,
    );
    this.ensureUserParameterHelperSuccess("GET", input.userName ?? this.config.username, runResponse.body);
    responses.push(runResponse);

    if (input.deleteHelperAfterRun ?? true) {
      responses.push(await this.deleteObject({
        objectType: "class",
        objectName: helperClassName,
        transportRequest: input.transportRequest,
      }));
    }

    return responses;
  }

  async setUserParameters(input: AdtSetUserParametersInput): Promise<AdtResponseSummary[]> {
    const helperClassName = truncateObjectName(
      input.helperClassName ?? `ZCL_MCP_PSET_${input.userName ?? this.config.username}`,
      30,
    );
    const responses: AdtResponseSummary[] = [];

    try {
      responses.push(await this.createClass({
        className: helperClassName,
        description: `MCP helper for user parameters ${normalizeObjectName(input.userName ?? this.config.username)}`,
        packageName: input.helperPackageName,
        masterSystem: input.masterSystem ?? this.config.defaultMasterSystem,
        transportRequest: input.transportRequest,
      }));
    } catch (error) {
      const message = String(error);
      if (!message.includes("already_exists")) {
        throw error;
      }
    }

    responses.push(await this.writeObject({
      objectType: "class",
      objectName: helperClassName,
      content: this.buildSetUserParametersHelperClassSource(input, helperClassName),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    const runResponse = await this.runClass({ className: helperClassName });
    this.ensureSuccess(
      runResponse,
      `Failed to run helper class ${helperClassName} for user parameter update ${normalizeObjectName(input.userName ?? this.config.username)}`,
    );
    this.ensureUserParameterHelperSuccess("SET", input.userName ?? this.config.username, runResponse.body);
    responses.push(runResponse);

    if (input.deleteHelperAfterRun ?? true) {
      responses.push(await this.deleteObject({
        objectType: "class",
        objectName: helperClassName,
        transportRequest: input.transportRequest,
      }));
    }

    return responses;
  }

  async runProgram(input: AdtRunProgramInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.programName);
    const query = new URLSearchParams();
    if (input.profilerId) {
      query.set("profilerId", input.profilerId);
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request(
      "POST",
      `/programs/programrun/${encodeURIComponent(normalizedName)}${suffix}`,
      {
        body: "",
        headers: {
          "Content-Type": "text/plain",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );
  }

  async runClass(input: AdtRunClassInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.className);
    const query = new URLSearchParams();
    if (input.profilerId) {
      query.set("profilerId", input.profilerId);
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request(
      "POST",
      `/oo/classrun/${encodeURIComponent(normalizedName)}${suffix}`,
      {
        body: "",
        headers: {
          "Content-Type": "text/plain",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );
  }

  async getAbapUnitMetadata(): Promise<AdtResponseSummary> {
    return this.request("GET", "/abapunit/metadata");
  }

  async runAbapUnit(input: AdtRunAbapUnitInput): Promise<AdtResponseSummary> {
    const objectType = input.objectType;
    const resolvedUri = this.resolveObjectUri(objectType, input.objectName, input.uri);

    const definitionUri = this.toDefinitionIdentifierUri(
      objectType,
      input.objectName,
      resolvedUri,
    );
    const objectName = input.objectName ?? this.extractObjectNameFromUri(definitionUri);
    const objectReferenceType = objectType === "class" ? "CLAS/OC" : "PROG/P";
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<external><coverage active="false"/></external>` +
      `<options>` +
      `<uriType value="semantic"/>` +
      `<testDeterminationStrategy appendAssignedTestsPreview="true"` +
      ` assignedTests="${input.assignedTests ?? false}"` +
      ` sameProgram="${input.sameProgram ?? true}"/>` +
      `<testRiskLevels` +
      ` critical="${input.criticalRiskLevel ?? true}"` +
      ` dangerous="${input.dangerousRiskLevel ?? true}"` +
      ` harmless="${input.harmlessRiskLevel ?? true}"/>` +
      `<testDurations` +
      ` long="${input.longDuration ?? true}"` +
      ` medium="${input.mediumDuration ?? true}"` +
      ` short="${input.shortDuration ?? true}"/>` +
      `<withNavigationUri enabled="${input.withNavigationUri ?? false}"/>` +
      `</options>` +
      `<adtcore:objectSets>` +
      `<objectSet kind="inclusive">` +
      `<adtcore:objectReferences>` +
      `<adtcore:objectReference adtcore:uri="${this.toAbsoluteAdtUri(definitionUri)}"` +
      ` adtcore:type="${objectReferenceType}"` +
      ` adtcore:name="${xmlEscape(normalizeObjectName(objectName))}"/>` +
      `</adtcore:objectReferences>` +
      `</objectSet>` +
      `</adtcore:objectSets>` +
      `</aunit:runConfiguration>`;

    return this.request("POST", "/abapunit/testruns", {
      body,
      headers: {
        "Content-Type": "application/vnd.sap.adt.abapunit.testruns.config.v4+xml",
        Accept: "application/vnd.sap.adt.abapunit.testruns.result.v2+xml",
      },
      stateful: true,
      session: { cookies: new Map() },
    });
  }

  async writeObject(input: WriteObjectInput): Promise<AdtResponseSummary> {
    const uri = this.resolveObjectUri(
      input.objectType,
      input.objectName,
      input.containerName,
      input.uri,
    );
    const lockResult = await this.lock(uri);

    try {
      const query = new URLSearchParams({
        lockHandle: lockResult.lockHandle,
      });

      const corrNr = input.transportRequest ?? lockResult.transportRequest;
      if (corrNr) {
        query.set("corrNr", corrNr);
      }

      const response = await this.request(
        "PUT",
        `${uri}?${query.toString()}`,
        {
          body: input.content,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          stateful: true,
        },
      );

      if (input.activateAfterWrite) {
        await this.unlock(uri, lockResult.lockHandle);
        await this.activateObject({
          uri: this.toDefinitionIdentifierUri(input.objectType, input.objectName, uri, input.containerName),
          name: input.objectName,
          type: this.toActivationObjectType(input.objectType),
        });
      } else {
        await this.unlock(uri, lockResult.lockHandle);
      }

      return response;
    } catch (error) {
      try {
        await this.unlock(uri, lockResult.lockHandle);
      } catch {
        // Keep original failure. Unlock errors are secondary here.
      }
      throw error;
    }
  }

  async deleteObject(input: AdtDeleteObjectInput): Promise<AdtResponseSummary> {
    const deleteUri = this.resolveDeleteUri(input.objectType, input.objectName, input.containerName, input.uri);
    const lockUri = this.resolveDeleteLockUri(input.objectType, deleteUri);
    const lockResult = await this.lock(lockUri);

    try {
      const query = this.buildLockQuery(
        lockResult.lockHandle,
        input.transportRequest ?? lockResult.transportRequest,
      );

      const response = await this.request(
        "DELETE",
        `${deleteUri}?${query}`,
        {
          stateful: true,
        },
      );

      return response;
    } catch (error) {
      try {
        await this.unlock(lockUri, lockResult.lockHandle);
      } catch {
        // Keep the original delete error.
      }
      throw error;
    }
  }

  async createPackage(input: AdtCreatePackageInput): Promise<AdtResponseSummary> {
    const packageXml = this.buildPackageXml(input);
    const response = await this.request("POST", "/packages", {
      body: packageXml,
      headers: {
        "Content-Type": "application/vnd.sap.adt.packages.v2+xml",
      },
      stateful: true,
    });
    this.ensureSuccess(response, `Failed to create package ${normalizeObjectName(input.packageName)}`);
    return response;
  }

  async createFunctionGroup(input: AdtCreateFunctionGroupInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.groupName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const response = await this.request("POST", `/functions/groups?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildFunctionGroupXml(input),
      headers: {
        "Content-Type": "application/vnd.sap.adt.functions.groups.v3+xml",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "functiongroup", normalizedName))) {
      this.ensureCreateSuccess(response, "function group", normalizedName);
    }
    return response;
  }

  async createFunctionModule(input: AdtCreateFunctionModuleInput): Promise<AdtResponseSummary> {
    const normalizedGroup = normalizeObjectName(input.groupName);
    const normalizedName = normalizeObjectName(input.functionModuleName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const response = await this.request(
      "POST",
      `/functions/groups/${normalizedGroup.toLowerCase()}/fmodules?${this.buildCorrNrQuery(transportRequest)}`,
      {
        body: this.buildFunctionModuleXml(input),
        headers: {
          "Content-Type": "application/vnd.sap.adt.functions.fmodules.v3+xml",
        },
        stateful: true,
      },
    );
    if (!(await this.canContinueAfterCreateLock(response, "functionmodule", normalizedName, normalizedGroup))) {
      this.ensureCreateSuccess(response, "function module", normalizedName);
    }
    return response;
  }

  async createTransportRequest(input: AdtCreateTransportRequestInput): Promise<AdtResponseSummary> {
    const requestXml = this.buildTransportRequestXml(input);
    const response = await this.request("POST", "/cts/transportrequests", {
      body: requestXml,
      headers: {
        "Content-Type": "application/vnd.sap.adt.transportorganizer.v1+xml",
      },
      stateful: true,
    });
    this.ensureSuccess(response, `Failed to create transport request ${input.description}`);
    return response;
  }

  async listTransportRequests(input: AdtListTransportRequestsInput = {}): Promise<AdtResponseSummary> {
    const params = new URLSearchParams();
    params.set("targets", "");
    if (input.requestStatus) {
      params.set("requestStatus", input.requestStatus);
    }
    if (input.requestType) {
      params.set("requestType", input.requestType);
    }
    if (input.owner) {
      params.set("User", normalizeObjectName(input.owner));
    }
    return this.request("GET", `/cts/transportrequests?${params.toString()}`);
  }

  async getTransportRequest(input: AdtGetTransportRequestInput): Promise<AdtResponseSummary> {
    return this.request(
      "GET",
      `/cts/transportrequests/${encodeURIComponent(normalizeObjectName(input.requestNumber))}`,
    );
  }

  async checkTransportRequest(input: AdtGetTransportRequestInput): Promise<AdtResponseSummary> {
    return this.request(
      "POST",
      `/cts/transportrequests/${encodeURIComponent(normalizeObjectName(input.requestNumber))}/consistencychecks`,
      {
        body: "",
        headers: {
          "Content-Type": "application/xml",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );
  }

  async releaseTransportRequest(input: AdtReleaseTransportRequestInput): Promise<AdtResponseSummary> {
    const requestNumber = normalizeObjectName(input.requestNumber);
    const mode = input.mode ?? "standard";
    const actionPath = (() => {
      switch (mode) {
        case "ignoreLocks":
          return "relwithignlock";
        case "ignoreWarnings":
          return "relwithignwarning";
        case "ignoreAtc":
          return "relObjigchkatc";
        default:
          return "newreleasejobs";
      }
    })();

    const body = this.buildTransportRequestActionXml(requestNumber);

    return this.request(
      "POST",
      `/cts/transportrequests/${encodeURIComponent(requestNumber)}/${actionPath}`,
      {
        body,
        headers: {
          "Content-Type": "application/xml",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );
  }

  async deleteTransportRequest(input: AdtDeleteTransportRequestInput): Promise<AdtResponseSummary> {
    return this.request(
      "DELETE",
      `/cts/transportrequests/${encodeURIComponent(normalizeObjectName(input.requestNumber))}`,
      {
        stateful: true,
        session: { cookies: new Map() },
      },
    );
  }

  async safeReleaseTransportRequest(input: AdtSafeReleaseTransportRequestInput): Promise<{
    detailBefore: AdtResponseSummary;
    inactiveBefore: AdtResponseSummary;
    releasedTasks: AdtResponseSummary[];
    sortAndCompress?: AdtResponseSummary;
    requestRelease?: AdtResponseSummary;
    detailAfter?: AdtResponseSummary;
  }> {
    const requestNumber = normalizeObjectName(input.requestNumber);
    const detailBefore = await this.getTransportRequest({ requestNumber });
    const inactiveBefore = await this.getActivationLog();
    const detail = this.parseTransportRequestDetail(detailBefore.body);
    const releasedTasks: AdtResponseSummary[] = [];

    if (input.releaseTasksFirst !== false) {
      for (const task of detail.tasks) {
        if (task["tm:status"] === "R") {
          continue;
        }
        releasedTasks.push(await this.releaseTransportRequest({
          requestNumber: task["tm:number"] ?? "",
          mode: "standard",
        }));
      }
    }

    if (input.failOnInactiveObjects !== false) {
      const inactiveNumbers = this.parseInactiveTransportRequestNumbers(inactiveBefore.body);
      if (inactiveNumbers.includes(requestNumber)) {
        throw new Error(
          `Request ${requestNumber} exists in ADT inactive transport list and should not be released before cleanup.`,
        );
      }
    }

    const body = this.buildTransportRequestActionXml(requestNumber);
    const sortAndCompress = await this.request(
      "POST",
      `/cts/transportrequests/${encodeURIComponent(requestNumber)}/sortandcompress`,
      {
        body,
        headers: {
          "Content-Type": "application/xml",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );

    const requestRelease = await this.request(
      "POST",
      `/cts/transportrequests/${encodeURIComponent(requestNumber)}/newreleasejobs`,
      {
        body,
        headers: {
          "Content-Type": "application/xml",
        },
        stateful: true,
        session: { cookies: new Map() },
      },
    );

    const detailAfter = await this.getTransportRequest({ requestNumber });

    return {
      detailBefore,
      inactiveBefore,
      releasedTasks,
      sortAndCompress,
      requestRelease,
      detailAfter,
    };
  }

  async createProgram(input: AdtCreateProgramInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.programName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const programXml = this.buildProgramXml(input);
    const response = await this.request("POST", `/programs/programs?${this.buildCorrNrQuery(transportRequest)}`, {
      body: programXml,
      headers: {
        "Content-Type": "application/vnd.sap.adt.programs.programs.v3+xml",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "program", normalizedName))) {
      this.ensureCreateSuccess(response, "program", normalizedName);
    }
    await this.activateObject({
      uri: `/programs/programs/${normalizedName.toLowerCase()}`,
      name: normalizedName,
      type: "PROG/P",
    });
    return response;
  }

  async createClass(input: AdtCreateClassInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.className);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const classXml = this.buildClassXml(input);
    const response = await this.request("POST", `/oo/classes?${this.buildCorrNrQuery(transportRequest)}`, {
      body: classXml,
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "class", normalizedName))) {
      this.ensureCreateSuccess(response, "class", normalizedName);
    }
    await this.activateObject({
      uri: `/oo/classes/${normalizedName.toLowerCase()}`,
      name: normalizedName,
      type: "CLAS/OC",
    });
    return response;
  }

  async createInterface(input: AdtCreateInterfaceInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.interfaceName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const interfaceXml = this.buildInterfaceXml(input);
    const response = await this.request("POST", `/oo/interfaces?${this.buildCorrNrQuery(transportRequest)}`, {
      body: interfaceXml,
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "interface", normalizedName))) {
      this.ensureCreateSuccess(response, "interface", normalizedName);
    }
    await this.activateObject({
      uri: `/oo/interfaces/${normalizedName.toLowerCase()}`,
      name: normalizedName,
      type: "INTF/OI",
    });
    return response;
  }

  async createDdls(input: AdtCreateDdlsInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.ddlName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const ddlsXml = this.buildDdlsXml(input);
    const response = await this.request("POST", `/ddic/ddl/sources?${this.buildCorrNrQuery(transportRequest)}`, {
      body: ddlsXml,
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "ddls", normalizedName))) {
      this.ensureCreateSuccess(response, "ddls", normalizedName);
    }
    return response;
  }

  async createBdef(input: AdtCreateBdefInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.bdefName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const bdefXml = this.buildBdefXml(input);
    const response = await this.request("POST", `/bo/behaviordefinitions?${this.buildCorrNrQuery(transportRequest)}`, {
      body: bdefXml,
      headers: {
        "Content-Type": "application/vnd.sap.adt.blues.v1+xml",
        Accept: "application/vnd.sap.adt.blues.v1+xml",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "bdef", normalizedName))) {
      this.ensureCreateSuccess(response, "bdef", normalizedName);
    }
    return response;
  }

  async createDcls(input: AdtCreateDclsInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.dclName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const dclsXml = this.buildDclsXml(input);
    const response = await this.request("POST", `/acm/dcl/sources?${this.buildCorrNrQuery(transportRequest)}`, {
      body: dclsXml,
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "dcls", normalizedName))) {
      this.ensureCreateSuccess(response, "dcls", normalizedName);
    }
    return response;
  }

  async createDdlx(input: AdtCreateDdlxInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.ddlxName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const ddlxXml = this.buildDdlxXml(input);
    const response = await this.request("POST", `/ddic/ddlx/sources?${this.buildCorrNrQuery(transportRequest)}`, {
      body: ddlxXml,
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    if (!(await this.canContinueAfterCreateLock(response, "ddlx", normalizedName))) {
      this.ensureCreateSuccess(response, "ddlx", normalizedName);
    }
    return response;
  }

  async createDataElement(input: AdtCreateDataElementInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.dataElementName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const createResponse = await this.request("POST", `/ddic/dataelements?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildDataElementCreateXml(input),
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    this.ensureCreateSuccess(createResponse, "data element", normalizedName);

    const uri = `/sap/bc/adt/ddic/dataelements/${normalizedName.toLowerCase()}`;
    const lockResult = await this.lock(uri);

    try {
      const updateResponse = await this.request(
        "PUT",
        `${uri}?${this.buildLockQuery(lockResult.lockHandle, transportRequest ?? lockResult.transportRequest)}`,
        {
          body: this.buildDataElementXml(input),
          headers: {
            "Content-Type": "application/vnd.sap.adt.dataelements.v2+xml; charset=utf-8",
          },
          stateful: true,
        },
      );
      this.ensureSuccess(updateResponse, `Failed to update data element ${normalizedName}`);
      await this.unlock(uri, lockResult.lockHandle);
      await this.activateObject({ uri, name: normalizedName, type: "DTEL/DE" });
      return updateResponse;
    } catch (error) {
      try {
        await this.unlock(uri, lockResult.lockHandle);
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }

  async createTable(input: AdtCreateTableInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.tableName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const createResponse = await this.request("POST", `/ddic/tables?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildTableCreateXml(input),
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    this.ensureCreateSuccess(createResponse, "table", normalizedName);

    const definitionUri = `/sap/bc/adt/ddic/tables/${normalizedName.toLowerCase()}`;
    const sourceUri = `${definitionUri}/source/main`;
    const lockResult = await this.lock(sourceUri);

    try {
      const updateResponse = await this.request(
        "PUT",
        `${sourceUri}?${this.buildLockQuery(lockResult.lockHandle, transportRequest ?? lockResult.transportRequest)}`,
        {
          body: input.source,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          stateful: true,
        },
      );
      this.ensureSuccess(updateResponse, `Failed to update table source ${normalizedName}`);
      await this.unlock(sourceUri, lockResult.lockHandle);
      await this.activateObject({ uri: definitionUri, name: normalizedName, type: "TABL/DT" });
      return updateResponse;
    } catch (error) {
      try {
        await this.unlock(sourceUri, lockResult.lockHandle);
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }

  async createTableType(input: AdtCreateTableTypeInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.tableTypeName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const createResponse = await this.request("POST", `/ddic/tabletypes?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildTableTypeCreateXml(input),
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    this.ensureCreateSuccess(createResponse, "table type", normalizedName);

    const uri = `/sap/bc/adt/ddic/tabletypes/${normalizedName.toLowerCase()}`;
    const lockResult = await this.lock(uri);

    try {
      const updateResponse = await this.request(
        "PUT",
        `${uri}?${this.buildLockQuery(lockResult.lockHandle, transportRequest ?? lockResult.transportRequest)}`,
        {
          body: this.buildTableTypeXml(input),
          headers: {
            "Content-Type": "application/vnd.sap.adt.tabletype.v1+xml; charset=utf-8",
          },
          stateful: true,
        },
      );
      this.ensureSuccess(updateResponse, `Failed to update table type ${normalizedName}`);
      await this.unlock(uri, lockResult.lockHandle);
      await this.activateObject({ uri, name: normalizedName, type: "TTYP/DA" });
      return updateResponse;
    } catch (error) {
      try {
        await this.unlock(uri, lockResult.lockHandle);
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }

  async createDomain(input: AdtCreateDomainInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.domainName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const createResponse = await this.request("POST", `/ddic/domains?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildDomainCreateXml(input),
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    this.ensureCreateSuccess(createResponse, "domain", normalizedName);

    const uri = `/sap/bc/adt/ddic/domains/${normalizedName.toLowerCase()}`;
    const lockResult = await this.lock(uri);

    try {
      const updateResponse = await this.request(
        "PUT",
        `${uri}?${this.buildLockQuery(lockResult.lockHandle, transportRequest ?? lockResult.transportRequest)}`,
        {
          body: this.buildDomainXml(input),
          headers: {
            "Content-Type": "application/vnd.sap.adt.domains.v2+xml; charset=utf-8",
          },
          stateful: true,
        },
      );
      this.ensureSuccess(updateResponse, `Failed to update domain ${normalizedName}`);
      await this.unlock(uri, lockResult.lockHandle);
      await this.activateObject({ uri, name: normalizedName, type: "DOMA/DD" });
      return updateResponse;
    } catch (error) {
      try {
        await this.unlock(uri, lockResult.lockHandle);
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }

  async createStructure(input: AdtCreateStructureInput): Promise<AdtResponseSummary> {
    const normalizedName = normalizeObjectName(input.structureName);
    const transportRequest = await this.resolveEffectiveTransportRequest(input.transportRequest);
    const createResponse = await this.request("POST", `/ddic/structures?${this.buildCorrNrQuery(transportRequest)}`, {
      body: this.buildStructureCreateXml(input),
      headers: {
        "Content-Type": "application/*",
      },
      stateful: true,
    });
    this.ensureCreateSuccess(createResponse, "structure", normalizedName);

    const definitionUri = `/sap/bc/adt/ddic/structures/${normalizedName.toLowerCase()}`;
    const sourceUri = `${definitionUri}/source/main`;
    const lockResult = await this.lock(sourceUri);

    try {
      const updateResponse = await this.request(
        "PUT",
        `${sourceUri}?${this.buildLockQuery(lockResult.lockHandle, transportRequest ?? lockResult.transportRequest)}`,
        {
          body: input.source,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          stateful: true,
        },
      );
      this.ensureSuccess(updateResponse, `Failed to update structure source ${normalizedName}`);
      await this.unlock(sourceUri, lockResult.lockHandle);
      await this.activateObject({ uri: definitionUri, name: normalizedName, type: "TABL/DS" });
      return updateResponse;
    } catch (error) {
      try {
        await this.unlock(sourceUri, lockResult.lockHandle);
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }

  async createScaffold(input: AdtCreateScaffoldInput): Promise<AdtResponseSummary[]> {
    const responses: AdtResponseSummary[] = [];

    if (input.createPackage) {
      responses.push(await this.createPackage({
        packageName: input.packageName,
        description: input.packageDescription ?? `${input.descriptionPrefix ?? "MCP"} package`,
        packageType: "development",
        recordChanges: true,
        softwareComponent: this.config.defaultSoftwareComponent,
        softwareComponentDescription: this.config.defaultSoftwareComponentDescription,
      }));
    }

    responses.push(await this.createProgram({
      programName: input.programName,
      description: `${input.descriptionPrefix ?? "MCP"} demo program`,
      packageName: input.packageName,
      masterSystem: input.masterSystem,
      abapLanguageVersion: input.abapLanguageVersion,
      transportRequest: input.transportRequest,
    }));

    responses.push(await this.createClass({
      className: input.className,
      description: `${input.descriptionPrefix ?? "MCP"} demo service`,
      packageName: input.packageName,
      masterSystem: input.masterSystem,
      transportRequest: input.transportRequest,
    }));

    responses.push(await this.createDdls({
      ddlName: input.ddlName,
      description: `${input.descriptionPrefix ?? "MCP"} CDS demo`,
      packageName: input.packageName,
      masterSystem: input.masterSystem,
      transportRequest: input.transportRequest,
    }));

    responses.push(await this.writeObject({
      objectType: "ddls",
      objectName: input.ddlName,
      content: this.buildScaffoldDdlsSource(input),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    responses.push(await this.writeObject({
      objectType: "class",
      objectName: input.className,
      content: this.buildScaffoldClassSource(input),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    responses.push(await this.writeObject({
      objectType: "program",
      objectName: input.programName,
      content: this.buildScaffoldProgramSource(input),
      transportRequest: input.transportRequest,
      activateAfterWrite: true,
    }));

    return responses;
  }

  async activateObject(request: AdtActivationRequest): Promise<AdtResponseSummary> {
    const activationInputName = request.objectName ?? request.name;
    const rawUri = request.objectType
      ? this.resolveObjectUri(request.objectType, activationInputName, request.containerName, request.uri)
      : request.uri;

    if (!rawUri) {
      throw new Error("Either uri or objectType + objectName must be supplied for activation.");
    }

    const activationUri = request.objectType
      ? this.toAbsoluteAdtUri(
        this.toDefinitionIdentifierUri(request.objectType, activationInputName, rawUri, request.containerName),
      )
      : this.toAbsoluteAdtUri(rawUri).replace(/\/source\/main$/i, "");

    const activationType = request.type
      ?? (request.objectType ? this.toActivationObjectType(request.objectType) : undefined)
      ?? this.inferActivationObjectType(activationUri);
    const activationParentUri = request.parentUri ? this.toAbsoluteAdtUri(request.parentUri) : undefined;
    const activationName = activationInputName ?? this.extractObjectNameFromUri(activationUri);
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:objectReference adtcore:uri="${activationUri}"` +
      `${activationType ? ` adtcore:type="${activationType}"` : ""}` +
      `${activationParentUri ? ` adtcore:parentUri="${activationParentUri}"` : ""}` +
      `${activationName ? ` adtcore:name="${normalizeObjectName(activationName)}"` : ""}` +
      `/>` +
      `</adtcore:objectReferences>`;

    let activationRun: AdtResponseSummary | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      activationRun = await this.request("POST", "/activation/runs", {
        body,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
        stateful: true,
      });

      if (this.isSessionTimedOutResponse(activationRun) || this.isTransientActivationStartFailure(activationRun)) {
        this.resetSession(this.statefulSession);
        continue;
      }

      break;
    }

    if (!activationRun) {
      throw new Error(`ADT activation run did not return a response for ${activationName ?? activationUri}`);
    }

    this.ensureSuccess(
      activationRun,
      `Failed to start activation for ${activationName ?? activationUri}`,
    );

    const runLocation = activationRun.headers.location ?? activationRun.headers["content-location"];
    if (!runLocation) {
      throw new Error(`ADT activation run did not return a run location for ${activationName ?? activationUri}`);
    }

    const relativeRunLocation = runLocation.replace(/^https?:\/\/[^/]+/, "").replace("/sap/bc/adt", "");
    const finalRun = await this.waitForActivationRun(relativeRunLocation);
    const diagnostics = await this.getActivationDiagnostics(finalRun);

    let inactiveAfterRun = false;
    if (activationName) {
      const inactiveObjects = await this.getActivationLog();
      inactiveAfterRun = inactiveObjects.body.includes(`adtcore:name="${normalizeObjectName(activationName)}"`);
    }

    if (this.didActivationFail(diagnostics, inactiveAfterRun)) {
      throw new Error(
        this.formatActivationFailureMessage(
          activationName ?? activationUri,
          diagnostics,
          finalRun.body,
          inactiveAfterRun,
        ),
      );
    }

    return finalRun;
  }

  async syntaxCheckObject(input: AdtSyntaxCheckObjectInput): Promise<{
    response: AdtResponseSummary;
    parsedResult: ReturnType<typeof parseSyntaxCheckResult>;
    objectType: SupportedObjectType;
    objectName?: string;
    definitionUri: string;
    sourceUri?: string;
    version: "active" | "inactive";
    mode: "repository" | "source_artifact";
  }> {
    const requestedUri = input.uri;
    const inferredObjectType = input.objectType ?? (requestedUri ? this.inferSupportedObjectTypeFromUri(requestedUri) : undefined);
    if (!inferredObjectType) {
      throw new Error("Either objectType or a recognizable ADT uri must be supplied for syntax check.");
    }

    if (!this.isSyntaxCheckSupportedObjectType(inferredObjectType)) {
      throw new Error(
        `Syntax check currently supports class, interface, program, DDLS, DCLS and DDLX. Received '${inferredObjectType}'.`,
      );
    }

    const objectName = input.objectName;
    const rawUri = input.objectType
      ? this.resolveObjectUri(input.objectType, objectName, input.containerName, requestedUri)
      : requestedUri;

    if (!rawUri) {
      throw new Error("Either uri or objectType + objectName must be supplied for syntax check.");
    }

    const version = input.version ?? "active";
    const definitionUri = input.objectType
      ? this.toDefinitionIdentifierUri(inferredObjectType, objectName, rawUri, input.containerName)
      : this.toSyntaxCheckDefinitionUri(inferredObjectType, rawUri);

    const response = this.isRepositorySyntaxCheckType(inferredObjectType)
      ? await this.runRepositorySyntaxCheck(definitionUri, version)
      : await this.runSourceArtifactSyntaxCheck(
        definitionUri,
        this.toSyntaxCheckSourceUri(inferredObjectType, rawUri),
        version,
      );

    this.ensureSuccess(
      response,
      `Failed to run syntax check for ${normalizeObjectName(objectName ?? this.extractObjectNameFromUri(definitionUri))}`,
    );

    return {
      response,
      parsedResult: parseSyntaxCheckResult(response.body),
      objectType: inferredObjectType,
      objectName: objectName ?? this.extractObjectNameFromUri(definitionUri),
      definitionUri: this.toAbsoluteAdtUri(definitionUri),
      sourceUri: this.isRepositorySyntaxCheckType(inferredObjectType)
        ? undefined
        : this.toAbsoluteAdtUri(this.toSyntaxCheckSourceUri(inferredObjectType, rawUri)),
      version,
      mode: this.isRepositorySyntaxCheckType(inferredObjectType) ? "repository" : "source_artifact",
    };
  }

  async syntaxCheckSource(input: AdtSyntaxCheckSourceInput): Promise<{
    response: AdtResponseSummary;
    parsedResult: ReturnType<typeof parseSyntaxCheckResult>;
    objectType: SupportedObjectType;
    objectName?: string;
    definitionUri: string;
    sourceUri: string;
    version: "active" | "inactive";
    mode: "draft_source_artifact";
  }> {
    const requestedUri = input.uri;
    const inferredObjectType = input.objectType ?? (requestedUri ? this.inferSupportedObjectTypeFromUri(requestedUri) : undefined);
    if (!inferredObjectType) {
      throw new Error("Either objectType or a recognizable ADT uri must be supplied for source syntax check.");
    }

    if (!this.isSyntaxCheckSupportedObjectType(inferredObjectType)) {
      throw new Error(
        `Source syntax check currently supports class, interface, program, DDLS, DCLS and DDLX. Received '${inferredObjectType}'.`,
      );
    }

    const objectName = input.objectName;
    const rawUri = input.objectType
      ? this.resolveObjectUri(input.objectType, objectName, input.containerName, requestedUri)
      : requestedUri;

    if (!rawUri) {
      throw new Error("Either uri or objectType + objectName must be supplied for source syntax check.");
    }

    const version = input.version ?? "active";
    const definitionUri = input.objectType
      ? this.toDefinitionIdentifierUri(inferredObjectType, objectName, rawUri, input.containerName)
      : this.toSyntaxCheckDefinitionUri(inferredObjectType, rawUri);
    const sourceUri = this.toSyntaxCheckSourceUri(inferredObjectType, rawUri);
    const response = await this.runSourceArtifactSyntaxCheck(
      definitionUri,
      sourceUri,
      version,
      input.content,
    );

    this.ensureSuccess(
      response,
      `Failed to run source syntax check for ${normalizeObjectName(objectName ?? this.extractObjectNameFromUri(definitionUri))}`,
    );

    return {
      response,
      parsedResult: parseSyntaxCheckResult(response.body),
      objectType: inferredObjectType,
      objectName: objectName ?? this.extractObjectNameFromUri(definitionUri),
      definitionUri: this.toAbsoluteAdtUri(definitionUri),
      sourceUri: this.toAbsoluteAdtUri(sourceUri),
      version,
      mode: "draft_source_artifact",
    };
  }

  async activateDependencyChain(input: AdtActivateDependencyChainInput): Promise<Array<{
    requestedOrder: number;
    executionOrder: number;
    objectType: SupportedObjectType;
    objectName?: string;
    uri?: string;
    response: AdtResponseSummary;
  }>> {
    const orderedObjects = this.orderDependencyObjects(input.orderProfile ?? "auto", input.objects);
    const results: Array<{
      requestedOrder: number;
      executionOrder: number;
      objectType: SupportedObjectType;
      objectName?: string;
      uri?: string;
      response: AdtResponseSummary;
    }> = [];

    for (const item of orderedObjects) {
      const response = await this.activateObject({
        objectType: item.objectType,
        objectName: item.objectName,
        uri: item.uri,
      });

      results.push({
        requestedOrder: item.requestedOrder,
        executionOrder: item.executionOrder,
        objectType: item.objectType,
        objectName: item.objectName,
        uri: item.uri,
        response,
      });
    }

    return results;
  }

  async activateObjectSet(input: AdtActivateObjectSetInput): Promise<{
    orderProfile: "auto" | "consumerProgram" | "consumptionView";
    stopOnError: boolean;
    requestedCount: number;
    attemptedCount: number;
    successCount: number;
    failureCount: number;
    stopped: boolean;
    stoppedAtExecutionOrder?: number;
    stoppedAtObject?: {
      objectType: SupportedObjectType;
      objectName?: string;
      uri?: string;
    };
    results: Array<{
      requestedOrder: number;
      executionOrder: number;
      objectType: SupportedObjectType;
      objectName?: string;
      uri?: string;
      success: boolean;
      error?: string;
      response?: AdtResponseSummary;
    }>;
  }> {
    const orderProfile = input.orderProfile ?? "auto";
    const stopOnError = input.stopOnError ?? true;
    const orderedObjects = this.orderDependencyObjects(orderProfile, input.objects);
    const results: Array<{
      requestedOrder: number;
      executionOrder: number;
      objectType: SupportedObjectType;
      objectName?: string;
      uri?: string;
      success: boolean;
      error?: string;
      response?: AdtResponseSummary;
    }> = [];
    let stoppedAtExecutionOrder: number | undefined;
    let stoppedAtObject:
      | {
        objectType: SupportedObjectType;
        objectName?: string;
        uri?: string;
      }
      | undefined;

    for (const item of orderedObjects) {
      try {
        const response = await this.activateObject({
          objectType: item.objectType,
          objectName: item.objectName,
          uri: item.uri,
        });

        results.push({
          requestedOrder: item.requestedOrder,
          executionOrder: item.executionOrder,
          objectType: item.objectType,
          objectName: item.objectName,
          uri: item.uri,
          success: true,
          response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          requestedOrder: item.requestedOrder,
          executionOrder: item.executionOrder,
          objectType: item.objectType,
          objectName: item.objectName,
          uri: item.uri,
          success: false,
          error: message,
        });

        if (stopOnError) {
          stoppedAtExecutionOrder = item.executionOrder;
          stoppedAtObject = {
            objectType: item.objectType,
            objectName: item.objectName,
            uri: item.uri,
          };
          break;
        }
      }
    }

    return {
      orderProfile,
      stopOnError,
      requestedCount: input.objects.length,
      attemptedCount: results.length,
      successCount: results.filter((item) => item.success).length,
      failureCount: results.filter((item) => !item.success).length,
      stopped: stoppedAtExecutionOrder !== undefined,
      stoppedAtExecutionOrder,
      stoppedAtObject,
      results,
    };
  }

  async getActivationLog(): Promise<AdtResponseSummary> {
    return this.request("GET", "/activation/inactiveobjects");
  }

  private async waitForActivationRun(runUri: string): Promise<AdtResponseSummary> {
    let lastResponse: AdtResponseSummary | undefined;

    for (let index = 0; index < 5; index += 1) {
      const separator = runUri.includes("?") ? "&" : "?";
      const response = await this.request("GET", `${runUri}${separator}withLongPolling=true`, {
        stateful: true,
      });
      lastResponse = response;

      const status = parseXmlAttribute(response.body, "runs:run", "runs:status");
      if (!status || status.toLowerCase() === "finished") {
        return response;
      }
    }

    if (!lastResponse) {
      throw new Error(`ADT activation run did not return any status for ${runUri}`);
    }

    return lastResponse;
  }

  private isTransientActivationStartFailure(response: AdtResponseSummary): boolean {
    return response.status === 451 && response.body.includes("connection closed (no data)");
  }

  private orderDependencyObjects(
    orderProfile: "auto" | "consumerProgram" | "consumptionView",
    objects: AdtDependencyObjectInput[],
  ): OrderedDependencyObject[] {
    const rankByProfile: Record<"auto" | "consumerProgram" | "consumptionView", Record<SupportedObjectType, number>> = {
      auto: {
        functiongroup: 5,
        functionmodule: 10,
        interface: 5,
        ddls: 20,
        bdef: 55,
        dcls: 30,
        ddlx: 40,
        class: 50,
        program: 60,
      },
      consumerProgram: {
        functiongroup: 5,
        functionmodule: 10,
        interface: 10,
        ddls: 20,
        class: 30,
        bdef: 35,
        program: 40,
        dcls: 50,
        ddlx: 60,
      },
      consumptionView: {
        functiongroup: 5,
        functionmodule: 10,
        interface: 5,
        ddls: 20,
        bdef: 55,
        dcls: 30,
        ddlx: 40,
        class: 50,
        program: 60,
      },
    };

    return objects
      .map((item, index) => ({
        ...item,
        requestedOrder: index + 1,
        executionOrder: 0,
      }))
      .sort((left, right) => {
        const leftRank = rankByProfile[orderProfile][left.objectType] ?? 999;
        const rightRank = rankByProfile[orderProfile][right.objectType] ?? 999;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return left.requestedOrder - right.requestedOrder;
      })
      .map((item, index) => ({
        ...item,
        executionOrder: index + 1,
      }));
  }

  private async getActivationDiagnostics(finalRun: AdtResponseSummary): Promise<ActivationDiagnostics | undefined> {
    const resultHref = this.extractActivationResultHref(finalRun.body);
    if (!resultHref) {
      return undefined;
    }

    const resultUri = resultHref.replace(/^https?:\/\/[^/]+/, "").replace("/sap/bc/adt", "");
    const resultResponse = await this.request("GET", resultUri, {
      stateful: true,
    });

    const messages = this.parseActivationMessages(resultResponse.body);
    const checkExecuted = parseXmlAttribute(resultResponse.body, "chkl:properties", "checkExecuted");
    const activationExecuted = parseXmlAttribute(
      resultResponse.body,
      "chkl:properties",
      "activationExecuted",
    );
    const generationExecuted = parseXmlAttribute(
      resultResponse.body,
      "chkl:properties",
      "generationExecuted",
    );

    return {
      category: this.classifyActivationFailure(messages, activationExecuted, resultResponse.body),
      summary: this.summarizeActivationDiagnostics(messages, checkExecuted, activationExecuted, generationExecuted),
      checkExecuted,
      activationExecuted,
      generationExecuted,
      messages,
      resultBody: resultResponse.body,
    };
  }

  private extractActivationResultHref(runBody: string): string | undefined {
    const match = runBody.match(/<atom:link\b[^>]*href="([^"]+)"[^>]*title="Activation result link"/i);
    return match?.[1];
  }

  private parseActivationMessages(xml: string): ActivationDiagnosticMessage[] {
    const messages: ActivationDiagnosticMessage[] = [];
    const regex = /<msg\b([^>]*)>([\s\S]*?)<\/msg>/gi;
    let match = regex.exec(xml);

    while (match) {
      const attrs = parseTagAttributes(match[1]);
      const body = match[2];
      const textMatches = [...body.matchAll(/<txt>([\s\S]*?)<\/txt>/gi)];
      const shortText = textMatches
        .map((item) => item[1].trim())
        .filter((item) => item.length > 0)
        .join(" | ");

      messages.push({
        type: attrs.type ?? "",
        objectDescription: attrs.objDescr,
        line: attrs.line,
        href: attrs.href,
        shortText,
      });

      match = regex.exec(xml);
    }

    return messages;
  }

  private didActivationFail(
    diagnostics: ActivationDiagnostics | undefined,
    inactiveAfterRun: boolean,
  ): boolean {
    if (!diagnostics) {
      return inactiveAfterRun;
    }

    if (diagnostics.messages.some((message) => ["E", "A", "X"].includes(message.type))) {
      return true;
    }

    return inactiveAfterRun;
  }

  private classifyActivationFailure(
    messages: ActivationDiagnosticMessage[],
    activationExecuted: string | undefined,
    resultBody: string,
  ): string {
    const combined = `${messages.map((message) => message.shortText).join(" ")} ${resultBody}`.toLowerCase();

    if (combined.includes("locked") || combined.includes("request") || combined.includes("transport")) {
      return "lock_or_transport_error";
    }

    if (
      combined.includes("unknown")
      || combined.includes("syntax")
      || combined.includes("statement")
      || combined.includes("type \"")
    ) {
      return "syntax_or_semantic_error";
    }

    if (
      combined.includes("does not exist")
      || combined.includes("not found")
      || combined.includes("inactive")
      || combined.includes("cancelled")
    ) {
      return "activation_dependency_failure";
    }

    if (activationExecuted === "false") {
      return "activation_not_executed";
    }

    if (messages.some((message) => ["E", "A", "X"].includes(message.type))) {
      return "activation_error";
    }

    return "activation_failed";
  }

  private summarizeActivationDiagnostics(
    messages: ActivationDiagnosticMessage[],
    checkExecuted: string | undefined,
    activationExecuted: string | undefined,
    generationExecuted: string | undefined,
  ): string {
    const errorCount = messages.filter((message) => ["E", "A", "X"].includes(message.type)).length;
    const warningCount = messages.filter((message) => message.type === "W").length;
    const firstRelevant =
      messages.find((message) => ["E", "A", "X"].includes(message.type))
      ?? messages.find((message) => message.type === "W");
    const executionSummary =
      `checkExecuted=${checkExecuted ?? "?"}, `
      + `activationExecuted=${activationExecuted ?? "?"}, `
      + `generationExecuted=${generationExecuted ?? "?"}`;

    if (!firstRelevant) {
      return `${executionSummary}; no detailed activation messages returned.`;
    }

    const objectPart = firstRelevant.objectDescription ? ` Object: ${firstRelevant.objectDescription}.` : "";
    const linePart = firstRelevant.line && firstRelevant.line !== "0" ? ` Line: ${firstRelevant.line}.` : "";
    return `${executionSummary}; errors=${errorCount}, warnings=${warningCount}. First message: ${firstRelevant.shortText}.${objectPart}${linePart}`;
  }

  private formatActivationFailureMessage(
    activationNameOrUri: string,
    diagnostics: ActivationDiagnostics | undefined,
    finalRunBody: string,
    inactiveAfterRun = false,
  ): string {
    const normalizedTarget = activationNameOrUri.startsWith("/sap/bc/adt/")
      ? activationNameOrUri
      : normalizeObjectName(activationNameOrUri);
    const lines = [
      `Activation failed for ${normalizedTarget}.`,
    ];

    if (inactiveAfterRun) {
      lines.push("The object is still listed as inactive after the activation run.");
    }

    if (diagnostics) {
      lines.push(`Category: ${diagnostics.category}`);
      lines.push(`Summary: ${diagnostics.summary}`);

      const firstMessages = diagnostics.messages
        .filter((message) => message.shortText.length > 0)
        .sort((left, right) => {
          const leftRank = ["E", "A", "X"].includes(left.type) ? 0 : left.type === "W" ? 1 : 2;
          const rightRank = ["E", "A", "X"].includes(right.type) ? 0 : right.type === "W" ? 1 : 2;
          return leftRank - rightRank;
        })
        .slice(0, 3)
        .map((message, index) => {
          const objectPart = message.objectDescription ? ` [${message.objectDescription}]` : "";
          return `${index + 1}. ${message.type}${objectPart} ${message.shortText}`;
        });

      if (firstMessages.length > 0) {
        lines.push("Messages:");
        lines.push(...firstMessages);
      }

      if (diagnostics.resultBody) {
        lines.push("Raw activation result XML:");
        lines.push(trimBody(diagnostics.resultBody, 6000));
      }
    }

    lines.push("Raw activation run XML:");
    lines.push(trimBody(finalRunBody, 3000));
    return lines.join("\n");
  }

  private extractObjectNameFromUri(uri: string): string {
    const cleanedUri = uri.replace(/^https?:\/\/[^/]+/, "").replace(/^\/sap\/bc\/adt/, "");
    const segments = cleanedUri.split("/").filter(Boolean);
    const lastSegment = segments.at(-1) ?? "";
    return normalizeObjectName(decodeURIComponent(lastSegment));
  }

  async lock(uri: string): Promise<AdtLockResult> {
    const response = await this.request(
      "POST",
      `${uri}?_action=LOCK&accessMode=MODIFY`,
      {
        headers: {
          Accept: "application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result",
        },
        stateful: true,
      },
    );

    const lockHandle = parseXmlTag(response.body, "LOCK_HANDLE");
    if (!lockHandle) {
      throw new Error(
        `ADT lock failed for ${uri}: ${response.status} ${response.statusText}\n${response.body}`,
      );
    }

    return {
      lockHandle,
      transportRequest: parseXmlTag(response.body, "CORRNR"),
      transportText: parseXmlTag(response.body, "CORRTEXT"),
      transportUser: parseXmlTag(response.body, "CORRUSER"),
      isLocal: parseXmlTag(response.body, "IS_LOCAL"),
      rawBody: response.body,
    };
  }

  async unlock(uri: string, lockHandle: string): Promise<AdtResponseSummary> {
    return this.request(
      "POST",
      `${uri}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`,
      {
        stateful: true,
      },
    );
  }

  async lockObject(input: AdtLockObjectInput): Promise<{
    objectType?: SupportedObjectType;
    objectName?: string;
    lockUri: string;
    result: AdtLockResult;
  }> {
    const lockUri = this.resolveExplicitLockUri(input.objectType, input.objectName, input.containerName, input.uri);
    const result = await this.lock(lockUri);
    return {
      objectType: input.objectType,
      objectName: input.objectName ?? this.extractObjectNameFromUri(lockUri),
      lockUri: this.toAbsoluteAdtUri(lockUri),
      result,
    };
  }

  async unlockObject(input: AdtUnlockObjectInput): Promise<{
    objectType?: SupportedObjectType;
    objectName?: string;
    lockUri: string;
    response: AdtResponseSummary;
  }> {
    const lockUri = this.resolveExplicitLockUri(input.objectType, input.objectName, input.containerName, input.uri);
    const response = await this.unlock(lockUri, input.lockHandle);
    this.ensureSuccess(
      response,
      `Failed to unlock ${normalizeObjectName(input.objectName ?? this.extractObjectNameFromUri(lockUri))}`,
    );
    return {
      objectType: input.objectType,
      objectName: input.objectName ?? this.extractObjectNameFromUri(lockUri),
      lockUri: this.toAbsoluteAdtUri(lockUri),
      response,
    };
  }

  private async runRepositorySyntaxCheck(
    definitionUri: string,
    version: "active" | "inactive",
  ): Promise<AdtResponseSummary> {
    const absoluteDefinitionUri = this.toAbsoluteAdtUri(definitionUri);
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<chkrun:checkObjectList xmlns:adtcore="http://www.sap.com/adt/core" xmlns:chkrun="http://www.sap.com/adt/checkrun">` +
      `<chkrun:checkObject adtcore:uri="${xmlEscape(absoluteDefinitionUri)}" chkrun:version="${xmlEscape(version)}"/>` +
      `</chkrun:checkObjectList>`;

    return this.request("POST", "/checkruns?reporters=abapCheckRun", {
      body,
      headers: {
        Accept: "application/vnd.sap.adt.checkmessages+xml",
        "Content-Type": "application/vnd.sap.adt.checkobjects+xml",
      },
      stateful: true,
    });
  }

  private async runSourceArtifactSyntaxCheck(
    definitionUri: string,
    sourceUri: string,
    version: "active" | "inactive",
    contentOverride?: string,
  ): Promise<AdtResponseSummary> {
    const absoluteDefinitionUri = this.toAbsoluteAdtUri(definitionUri);
    const absoluteSourceUri = this.toAbsoluteAdtUri(sourceUri);
    const content = contentOverride ?? await this.readSourceArtifactForSyntaxCheck(definitionUri, sourceUri);
    const encodedContent = Buffer.from(content, "utf8").toString("base64");
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<chkrun:checkObjectList xmlns:adtcore="http://www.sap.com/adt/core" xmlns:chkrun="http://www.sap.com/adt/checkrun">` +
      `<chkrun:checkObject adtcore:uri="${xmlEscape(absoluteDefinitionUri)}" chkrun:version="${xmlEscape(version)}">` +
      `<chkrun:artifacts>` +
      `<chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${xmlEscape(absoluteSourceUri)}">` +
      `<chkrun:content>${encodedContent}</chkrun:content>` +
      `</chkrun:artifact>` +
      `</chkrun:artifacts>` +
      `</chkrun:checkObject>` +
      `</chkrun:checkObjectList>`;

    return this.request("POST", "/checkruns?reporters=abapCheckRun", {
      body,
      headers: {
        Accept: "application/vnd.sap.adt.checkmessages+xml",
        "Content-Type": "application/vnd.sap.adt.checkobjects+xml",
      },
      stateful: true,
    });
  }

  private async readSourceArtifactForSyntaxCheck(definitionUri: string, sourceUri: string): Promise<string> {
    const sourceResponse = await this.request("GET", sourceUri);
    this.ensureSuccess(
      sourceResponse,
      `Failed to read current source for syntax check of ${normalizeObjectName(this.extractObjectNameFromUri(definitionUri))}`,
    );
    return sourceResponse.body;
  }

  private resolveObjectUri(
    objectType: SupportedObjectType,
    objectName?: string,
    containerName?: string,
    explicitUri?: string,
  ): string {
    if (explicitUri) {
      return explicitUri;
    }

    if (!objectName) {
      throw new Error("Either uri or objectName must be supplied.");
    }

    const template = this.config.uriTemplates[objectType];
    if (!template) {
      throw new Error(`No URI template configured for object type '${objectType}'.`);
    }

    return applyTemplate(template.uriTemplate, {
      objectName: normalizeObjectName(objectName),
      containerName: containerName ? normalizeObjectName(containerName) : "",
    });
  }

  private resolveExplicitLockUri(
    objectType?: SupportedObjectType,
    objectName?: string,
    containerName?: string,
    explicitUri?: string,
  ): string {
    if (objectType) {
      return this.resolveObjectUri(objectType, objectName, containerName, explicitUri);
    }

    if (!explicitUri) {
      throw new Error("Either uri or objectType + objectName must be supplied for lock handling.");
    }

    const relativeUri = this.toRelativeAdtRequestUri(explicitUri);
    return relativeUri.endsWith("/source/main") ? relativeUri : `${relativeUri.replace(/\/$/, "")}/source/main`;
  }

  private isSyntaxCheckSupportedObjectType(objectType: SupportedObjectType): boolean {
    return ["interface", "class", "program", "ddls", "dcls", "ddlx"].includes(objectType);
  }

  private isRepositorySyntaxCheckType(objectType: SupportedObjectType): boolean {
    return objectType === "ddls" || objectType === "dcls" || objectType === "ddlx";
  }

  private inferSupportedObjectTypeFromUri(uri: string): SupportedObjectType | undefined {
    const normalizedUri = this.toAbsoluteAdtUri(uri).toLowerCase();

    if (normalizedUri.includes("/oo/interfaces/")) {
      return "interface";
    }
    if (normalizedUri.includes("/oo/classes/")) {
      return "class";
    }
    if (normalizedUri.includes("/programs/programs/")) {
      return "program";
    }
    if (normalizedUri.includes("/ddic/ddl/sources/")) {
      return "ddls";
    }
    if (normalizedUri.includes("/bo/behaviordefinitions/")) {
      return "bdef";
    }
    if (normalizedUri.includes("/acm/dcl/sources/")) {
      return "dcls";
    }
    if (normalizedUri.includes("/ddic/ddlx/sources/")) {
      return "ddlx";
    }

    return undefined;
  }

  private toRelativeAdtRequestUri(uri: string): string {
    const withoutHost = uri.replace(/^https?:\/\/[^/]+/i, "");
    if (withoutHost.startsWith("/sap/bc/adt/")) {
      return withoutHost.replace(/^\/sap\/bc\/adt/i, "");
    }
    return withoutHost.startsWith("/") ? withoutHost : `/${withoutHost}`;
  }

  private toSyntaxCheckDefinitionUri(objectType: SupportedObjectType, uri: string): string {
    const relativeUri = this.toRelativeAdtRequestUri(uri);
    if (this.isRepositorySyntaxCheckType(objectType)) {
      return relativeUri.replace(/\/source\/main$/i, "");
    }
    return relativeUri.replace(/\/source\/main$/i, "");
  }

  private toSyntaxCheckSourceUri(objectType: SupportedObjectType, uri: string): string {
    const relativeUri = this.toRelativeAdtRequestUri(uri);
    if (this.isRepositorySyntaxCheckType(objectType)) {
      return relativeUri.replace(/\/source\/main$/i, "");
    }
    return relativeUri.endsWith("/source/main") ? relativeUri : `${relativeUri.replace(/\/$/, "")}/source/main`;
  }

  private toDefinitionIdentifierUri(
    objectType: SupportedObjectType,
    objectName: string | undefined,
    sourceUri: string,
    containerName?: string,
  ): string {
    if (!objectName) {
      return sourceUri.replace(/\/source\/main$/, "");
    }

    const normalized = normalizeObjectName(objectName).toLowerCase();
    switch (objectType) {
      case "functiongroup":
        return `/functions/groups/${normalized}`;
      case "functionmodule":
        if (!containerName) {
          throw new Error("containerName must be supplied for function module URIs.");
        }
        return `/functions/groups/${normalizeObjectName(containerName).toLowerCase()}/fmodules/${normalized}`;
      case "interface":
        return `/oo/interfaces/${normalized}`;
      case "class":
        return `/oo/classes/${normalized}`;
      case "program":
        return `/programs/programs/${normalized}`;
      case "ddls":
        return `/ddic/ddl/sources/${normalized}`;
      case "bdef":
        return `/bo/behaviordefinitions/${normalized}`;
      case "dcls":
        return `/acm/dcl/sources/${normalized}`;
      case "ddlx":
        return `/ddic/ddlx/sources/${normalized}`;
      default:
        return sourceUri.replace(/\/source\/main$/, "");
    }
  }

  private toActivationObjectType(objectType: SupportedObjectType): string | undefined {
    switch (objectType) {
      case "functiongroup":
        return "FUGR/F";
      case "functionmodule":
        return "FUGR/FF";
      case "interface":
        return "INTF/OI";
      case "class":
        return "CLAS/OC";
      case "program":
        return "PROG/P";
      case "ddls":
        return "DDLS/DF";
      case "bdef":
        return "BDEF/BDO";
      case "dcls":
        return "DCLS/DL";
      case "ddlx":
        return "DDLX/EX";
      default:
        return undefined;
    }
  }

  private inferActivationObjectType(uri: string): string | undefined {
    const normalizedUri = uri.toLowerCase();

    if (normalizedUri.includes("/functions/groups/") && normalizedUri.includes("/fmodules/")) {
      return "FUGR/FF";
    }
    if (normalizedUri.includes("/functions/groups/")) {
      return "FUGR/F";
    }
    if (normalizedUri.includes("/oo/interfaces/")) {
      return "INTF/OI";
    }
    if (normalizedUri.includes("/oo/classes/")) {
      return "CLAS/OC";
    }
    if (normalizedUri.includes("/programs/programs/")) {
      return "PROG/P";
    }
    if (normalizedUri.includes("/ddic/ddl/sources/")) {
      return "DDLS/DF";
    }
    if (normalizedUri.includes("/bo/behaviordefinitions/")) {
      return "BDEF/BDO";
    }
    if (normalizedUri.includes("/acm/dcl/sources/")) {
      return "DCLS/DL";
    }
    if (normalizedUri.includes("/ddic/ddlx/sources/")) {
      return "DDLX/EX";
    }
    if (normalizedUri.includes("/ddic/dataelements/")) {
      return "DTEL/DE";
    }
    if (normalizedUri.includes("/ddic/domains/")) {
      return "DOMA/DD";
    }
    if (normalizedUri.includes("/ddic/tables/")) {
      return "TABL/DT";
    }
    if (normalizedUri.includes("/ddic/structures/")) {
      return "TABL/DS";
    }
    if (normalizedUri.includes("/ddic/tabletypes/")) {
      return "TTYP/DA";
    }

    return undefined;
  }

  private toAbsoluteAdtUri(uri: string): string {
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri.replace(/^https?:\/\/[^/]+/i, "");
    }
    if (uri.startsWith("/sap/bc/adt/")) {
      return uri;
    }

    const adtPath = new URL(this.config.adtBaseUrl).pathname.replace(/\/$/, "");
    const normalizedUri = uri.startsWith("/") ? uri : `/${uri}`;
    return `${adtPath}${normalizedUri}`;
  }

  private resolveDeleteUri(
    objectType: DeletableObjectType,
    objectName?: string,
    containerName?: string,
    explicitUri?: string,
  ): string {
    if (explicitUri) {
      return explicitUri.replace(/\/source\/main$/, "");
    }

    if (!objectName) {
      throw new Error("Either uri or objectName must be supplied.");
    }

    const normalized = normalizeObjectName(objectName).toLowerCase();

    switch (objectType) {
      case "package":
        return `/packages/${normalized}`;
      case "dataelement":
        return `/ddic/dataelements/${normalized}`;
      case "domain":
        return `/ddic/domains/${normalized}`;
      case "table":
        return `/ddic/tables/${normalized}`;
      case "structure":
        return `/ddic/structures/${normalized}`;
      case "tabletype":
        return `/ddic/tabletypes/${normalized}`;
      default:
        return this.toDefinitionIdentifierUri(
          objectType,
          objectName,
          this.resolveObjectUri(objectType, objectName, containerName),
          containerName,
        );
    }
  }

  private resolveDeleteLockUri(objectType: DeletableObjectType, deleteUri: string): string {
    switch (objectType) {
      case "functiongroup":
      case "functionmodule":
      case "interface":
      case "class":
      case "program":
      case "ddls":
      case "bdef":
      case "dcls":
      case "ddlx":
      case "table":
      case "structure":
        return `${deleteUri}/source/main`;
      default:
        return deleteUri;
    }
  }

  private buildPackageXml(input: AdtCreatePackageInput): string {
    const normalizedName = normalizeObjectName(input.packageName);
    const normalizedSuper = input.superPackage ? normalizeObjectName(input.superPackage) : "";
    const addingObjectsAllowed = input.packageType === "structure" ? "true" : "false";

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}" adtcore:masterLanguage="EN" adtcore:masterSystem="${this.config.defaultMasterSystem}" ` +
      `adtcore:name="${normalizedName}" adtcore:type="DEVC/K" adtcore:description="${input.description}" adtcore:descriptionTextLimit="60" adtcore:language="EN">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedName.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedName}" adtcore:description="${input.description}"/>` +
      `<pak:attributes pak:packageType="${input.packageType}" pak:isPackageTypeEditable="true" pak:isAddingObjectsAllowed="${addingObjectsAllowed}" pak:isAddingObjectsAllowedEditable="true" pak:isEncapsulated="false" pak:isEncapsulationEditable="true" pak:isEncapsulationVisible="true" pak:recordChanges="${input.recordChanges ? "true" : "false"}" pak:isRecordChangesEditable="false" pak:isSwitchVisible="false" pak:languageVersion="" pak:isLanguageVersionVisible="true" pak:isLanguageVersionEditable="true"/>` +
      `<pak:superPackage>${normalizedSuper ? `<pak:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedSuper.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedSuper}" adtcore:description="${normalizedSuper}"/>` : ""}</pak:superPackage>` +
      `<pak:applicationComponent pak:name="" pak:description="" pak:isVisible="true" pak:isEditable="true"/>` +
      `<pak:transport>` +
      `<pak:softwareComponent pak:name="${input.softwareComponent}" pak:description="${input.softwareComponentDescription}" pak:isVisible="true" pak:isEditable="true"/>` +
      `<pak:transportLayer pak:name="" pak:description="" pak:isVisible="true" pak:isEditable="true"/>` +
      `</pak:transport>` +
      `<pak:useAccesses pak:isVisible="true"/>` +
      `<pak:packageInterfaces pak:isVisible="true"/>` +
      `<pak:subPackages/>` +
      `</pak:package>`;
  }

  private buildTransportRequestXml(input: AdtCreateTransportRequestInput): string {
    const owner = xmlEscape(input.owner ?? this.config.username.toUpperCase());
    const target = xmlEscape(input.target ?? "");
    const sourceClient = xmlEscape(input.sourceClient ?? "001");
    const description = xmlEscape(input.description);

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<tm:request tm:owner="${owner}" tm:desc="${description}" tm:type="${input.requestType}" tm:target="${target}" tm:source_client="${sourceClient}" />` +
      `</tm:root>`;
  }

  private buildTransportRequestActionXml(requestNumber: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<tm:root tm:number="${xmlEscape(requestNumber)}" xmlns:tm="http://www.sap.com/cts/adt/tm"/>`;
  }

  private buildFunctionGroupXml(input: AdtCreateFunctionGroupInput): string {
    const normalizedName = normalizeObjectName(input.groupName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<fugr:abapFunctionGroup xmlns:fugr="http://www.sap.com/adt/functions/groups" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:name="${normalizedName}" adtcore:type="FUGR/F" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</fugr:abapFunctionGroup>`;
  }

  private buildFunctionModuleXml(input: AdtCreateFunctionModuleInput): string {
    const normalizedGroup = normalizeObjectName(input.groupName);
    const normalizedName = normalizeObjectName(input.functionModuleName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:name="${normalizedName}" adtcore:type="FUGR/FF" adtcore:description="${xmlEscape(input.description)}" adtcore:language="EN">` +
      `<adtcore:containerRef adtcore:uri="/sap/bc/adt/functions/groups/${normalizedGroup.toLowerCase()}" adtcore:type="FUGR/F" adtcore:name="${normalizedGroup}" adtcore:packageName="${normalizedPackage}"/>` +
      `</fmodule:abapFunctionModule>`;
  }

  private parseTransportRequestDetail(xml: string): {
    request?: Record<string, string>;
    tasks: Array<Record<string, string>>;
  } {
    const requestMatch = xml.match(/<tm:request\b([^>]*)>/);
    const tasks: Array<Record<string, string>> = [];
    const taskRegex = /<tm:task\b([^>]*)>/g;
    let taskMatch = taskRegex.exec(xml);
    while (taskMatch) {
      tasks.push(this.parseTagAttributes(taskMatch[1]));
      taskMatch = taskRegex.exec(xml);
    }
    return {
      request: requestMatch ? this.parseTagAttributes(requestMatch[1]) : undefined,
      tasks,
    };
  }

  private parseInactiveTransportRequestNumbers(xml: string): string[] {
    const results = new Set<string>();
    const regex = /<ioc:ref\b([^>]*)\/>/g;
    let match = regex.exec(xml);
    while (match) {
      const attrs = this.parseTagAttributes(match[1]);
      const name = attrs["adtcore:name"];
      const uri = attrs["adtcore:uri"] ?? "";
      if (name && uri.includes("/cts/transportrequests/")) {
        results.add(name);
      }
      match = regex.exec(xml);
    }
    return [...results];
  }

  private parseTagAttributes(attributeText: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const regex = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
    let match = regex.exec(attributeText);
    while (match) {
      attributes[match[1]] = match[2]
        .replaceAll("&quot;", "\"")
        .replaceAll("&apos;", "'")
        .replaceAll("&gt;", ">")
        .replaceAll("&lt;", "<")
        .replaceAll("&amp;", "&");
      match = regex.exec(attributeText);
    }
    return attributes;
  }

  private buildProgramXml(input: AdtCreateProgramInput): string {
    const normalizedName = normalizeObjectName(input.programName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `program:programType="executableProgram" abapsource:sourceUri="source/main" abapsource:fixPointArithmetic="true" abapsource:activeUnicodeCheck="true" ` +
      `adtcore:responsible="${this.config.username}" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:abapLanguageVersion="${input.abapLanguageVersion}" ` +
      `adtcore:name="${normalizedName}" adtcore:type="PROG/P" adtcore:description="${input.description}" adtcore:descriptionTextLimit="70" adtcore:language="EN">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedPackage.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedPackage}"/>` +
      `<program:logicalDatabase><program:ref adtcore:name="D$S"/></program:logicalDatabase>` +
      `</program:abapProgram>`;
  }

  private buildClassXml(input: AdtCreateClassInput): string {
    const normalizedName = normalizeObjectName(input.className);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="CLAS/OC" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</class:abapClass>`;
  }

  private buildInterfaceXml(input: AdtCreateInterfaceInput): string {
    const normalizedName = normalizeObjectName(input.interfaceName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:name="${normalizedName}" adtcore:type="INTF/OI" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</intf:abapInterface>`;
  }

  private buildDdlsXml(input: AdtCreateDdlsInput): string {
    const normalizedName = normalizeObjectName(input.ddlName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="DDLS/DF" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</ddl:ddlSource>`;
  }

  private buildBdefXml(input: AdtCreateBdefInput): string {
    const normalizedName = normalizeObjectName(input.bdefName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:name="${normalizedName}" adtcore:type="BDEF/BDO" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:abapLanguageVersion="standard" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedPackage.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedPackage}"/>` +
      `</blue:blueSource>`;
  }

  private buildDclsXml(input: AdtCreateDclsInput): string {
    const normalizedName = normalizeObjectName(input.dclName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<dcl:dclSource xmlns:dcl="http://www.sap.com/adt/acm/dclsources" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:name="${normalizedName}" adtcore:type="DCLS/DL" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</dcl:dclSource>`;
  }

  private buildDdlxXml(input: AdtCreateDdlxInput): string {
    const normalizedName = normalizeObjectName(input.ddlxName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ddlx:ddlxSource xmlns:ddlx="http://www.sap.com/adt/ddic/ddlxsources" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:name="${normalizedName}" adtcore:type="DDLX/EX" adtcore:language="EN" ` +
      `adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</ddlx:ddlxSource>`;
  }

  private buildDataElementCreateXml(input: AdtCreateDataElementInput): string {
    const normalizedName = normalizeObjectName(input.dataElementName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="DTEL/DE" ` +
      `adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</blue:wbobj>`;
  }

  private buildDataElementXml(input: AdtCreateDataElementInput): string {
    const normalizedName = normalizeObjectName(input.dataElementName);
    const normalizedPackage = normalizeObjectName(input.packageName);
    const normalizedDomain = normalizeObjectName(input.domainName);
    const normalizedComponent = normalizeObjectName(input.defaultComponentName);

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<blue:wbobj adtcore:responsible="${this.config.username.toUpperCase()}" adtcore:masterLanguage="EN" ` +
      `adtcore:masterSystem="${input.masterSystem}" adtcore:abapLanguageVersion="standard" ` +
      `adtcore:name="${normalizedName}" adtcore:type="DTEL/DE" adtcore:version="inactive" ` +
      `adtcore:description="${input.description}" adtcore:language="EN" ` +
      `xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedPackage.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedPackage}"/>` +
      `<dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements">` +
      `<dtel:typeKind>domain</dtel:typeKind>` +
      `<dtel:typeName>${normalizedDomain}</dtel:typeName>` +
      `<dtel:shortFieldLabel>${input.shortFieldLabel}</dtel:shortFieldLabel>` +
      `<dtel:mediumFieldLabel>${input.mediumFieldLabel}</dtel:mediumFieldLabel>` +
      `<dtel:longFieldLabel>${input.longFieldLabel}</dtel:longFieldLabel>` +
      `<dtel:headingFieldLabel>${input.headingFieldLabel}</dtel:headingFieldLabel>` +
      `<dtel:searchHelp/><dtel:searchHelpParameter/><dtel:setGetParameter/>` +
      `<dtel:defaultComponentName>${normalizedComponent}</dtel:defaultComponentName>` +
      `<dtel:deactivateInputHistory>false</dtel:deactivateInputHistory>` +
      `<dtel:changeDocument>false</dtel:changeDocument>` +
      `<dtel:leftToRightDirection>false</dtel:leftToRightDirection>` +
      `<dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering>` +
      `</dtel:dataElement>` +
      `</blue:wbobj>`;
  }

  private buildTableCreateXml(input: AdtCreateTableInput): string {
    const normalizedName = normalizeObjectName(input.tableName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="TABL/DT" ` +
      `adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</blue:blueSource>`;
  }

  private buildTableTypeCreateXml(input: AdtCreateTableTypeInput): string {
    const normalizedName = normalizeObjectName(input.tableTypeName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ttyp:tableType xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="TTYP/DA" ` +
      `adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</ttyp:tableType>`;
  }

  private buildTableTypeXml(input: AdtCreateTableTypeInput): string {
    const normalizedName = normalizeObjectName(input.tableTypeName);
    const normalizedPackage = normalizeObjectName(input.packageName);
    const normalizedRowType = normalizeObjectName(input.rowTypeName);

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<ttyp:tableType adtcore:responsible="${this.config.username.toUpperCase()}" adtcore:masterLanguage="EN" ` +
      `adtcore:masterSystem="${input.masterSystem}" adtcore:abapLanguageVersion="standard" ` +
      `adtcore:name="${normalizedName}" adtcore:type="TTYP/DA" adtcore:version="inactive" ` +
      `adtcore:description="${input.description}" adtcore:language="EN" ` +
      `xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedPackage.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${normalizedPackage}"/>` +
      `<ttyp:rowType>` +
      `<ttyp:typeKind>dictionaryType</ttyp:typeKind>` +
      `<ttyp:typeName>${normalizedRowType}</ttyp:typeName>` +
      `<ttyp:builtInType><ttyp:dataType>STRU</ttyp:dataType><ttyp:length>000000</ttyp:length><ttyp:decimals>000000</ttyp:decimals></ttyp:builtInType>` +
      `<ttyp:rangeType/>` +
      `</ttyp:rowType>` +
      `<ttyp:initialRowCount>00000</ttyp:initialRowCount>` +
      `<ttyp:accessType>${input.accessType}</ttyp:accessType>` +
      `<ttyp:primaryKey ttyp:isVisible="true" ttyp:isEditable="true">` +
      `<ttyp:definition>standard</ttyp:definition>` +
      `<ttyp:kind>nonUnique</ttyp:kind>` +
      `<ttyp:components ttyp:isVisible="false"/>` +
      `<ttyp:alias/>` +
      `</ttyp:primaryKey>` +
      `<ttyp:secondaryKeys ttyp:isVisible="true" ttyp:isEditable="true">` +
      `<ttyp:allowed>notSpecified</ttyp:allowed>` +
      `</ttyp:secondaryKeys>` +
      `</ttyp:tableType>`;
  }

  private buildDomainCreateXml(input: AdtCreateDomainInput): string {
    const normalizedName = normalizeObjectName(input.domainName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="DOMA/DD" ` +
      `adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</doma:domain>`;
  }

  private buildDomainXml(input: AdtCreateDomainInput): string {
    const normalizedName = normalizeObjectName(input.domainName);
    const normalizedPackage = normalizeObjectName(input.packageName);
    const decimals = input.decimals ?? "000000";
    const outputLength = input.outputLength ?? input.length;
    const valueTableName = input.valueTableName ? normalizeObjectName(input.valueTableName) : "";
    const fixedValuesXml = (input.fixedValues ?? [])
      .map((fixedValue, index) => {
        const position = fixedValue.position ?? String(index + 1).padStart(4, "0");
        return `<doma:fixValue>` +
          `<doma:position>${xmlEscape(position)}</doma:position>` +
          `<doma:low>${xmlEscape(fixedValue.low ?? "")}</doma:low>` +
          `<doma:high>${xmlEscape(fixedValue.high ?? "")}</doma:high>` +
          `<doma:text>${xmlEscape(fixedValue.text)}</doma:text>` +
          `</doma:fixValue>`;
      })
      .join("");

    return `<?xml version="1.0" encoding="utf-8"?>` +
      `<doma:domain adtcore:responsible="${this.config.username.toUpperCase()}" adtcore:masterLanguage="EN" ` +
      `adtcore:masterSystem="${input.masterSystem}" adtcore:abapLanguageVersion="standard" ` +
      `adtcore:name="${xmlEscape(normalizedName)}" adtcore:type="DOMA/DD" adtcore:version="inactive" ` +
      `adtcore:description="${xmlEscape(input.description)}" adtcore:language="EN" ` +
      `xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/${normalizedPackage.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${xmlEscape(normalizedPackage)}"/>` +
      `<doma:content>` +
      `<doma:typeInformation><doma:datatype>${xmlEscape(input.dataType)}</doma:datatype><doma:length>${xmlEscape(input.length)}</doma:length><doma:decimals>${xmlEscape(decimals)}</doma:decimals></doma:typeInformation>` +
      `<doma:outputInformation><doma:length>${outputLength}</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>${input.lowercase ? "true" : "false"}</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation>` +
      `<doma:valueInformation><doma:valueTableRef>${xmlEscape(valueTableName)}</doma:valueTableRef><doma:appendExists>false</doma:appendExists><doma:fixValues>${fixedValuesXml}</doma:fixValues></doma:valueInformation>` +
      `</doma:content>` +
      `</doma:domain>`;
  }

  private buildStructureCreateXml(input: AdtCreateStructureInput): string {
    const normalizedName = normalizeObjectName(input.structureName);
    const normalizedPackage = normalizeObjectName(input.packageName);

    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" ` +
      `adtcore:description="${input.description}" adtcore:name="${normalizedName}" adtcore:type="TABL/DS" ` +
      `adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:masterSystem="${input.masterSystem}" ` +
      `adtcore:responsible="${this.config.username.toUpperCase()}">` +
      `<adtcore:packageRef adtcore:name="${normalizedPackage}"/>` +
      `</blue:blueSource>`;
  }

  private buildScaffoldDdlsSource(input: AdtCreateScaffoldInput): string {
    const ddlName = truncateObjectName(input.ddlName, 30);
    const sourceTableName = truncateObjectName(input.sourceTableName, 30);

    return `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '${xmlEscape(input.descriptionPrefix ?? "MCP")} CDS demo'
define view entity ${ddlName}
  as select from ${sourceTableName}
{
  key carrid,
  key connid,
  key fldate,
      price,
      currency,
      planetype,
      seatsmax,
      seatsocc
};`;
  }

  private buildScaffoldClassSource(input: AdtCreateScaffoldInput): string {
    const className = truncateObjectName(input.className, 30);
    const ddlName = truncateObjectName(input.ddlName, 30);

    return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    CLASS-METHODS get_flight_count
      IMPORTING
        iv_carrid TYPE s_carr_id
      RETURNING
        VALUE(rv_count) TYPE i.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD get_flight_count.
    SELECT COUNT( * )
      FROM ${ddlName}
      WHERE carrid = @iv_carrid
      INTO @rv_count.
  ENDMETHOD.
ENDCLASS.`;
  }

  private buildScaffoldProgramSource(input: AdtCreateScaffoldInput): string {
    const className = truncateObjectName(input.className, 30);

    return `REPORT ${truncateObjectName(input.programName, 40)}.

PARAMETERS p_carrid TYPE s_carr_id DEFAULT 'LH'.

START-OF-SELECTION.
  DATA(lv_count) = ${className}=>get_flight_count(
    iv_carrid = p_carrid ).

  WRITE: / 'Flights:', lv_count.`;
  }

  private toAbapStringLiteral(value: string | undefined): string {
    return `'${(value ?? "").replaceAll("'", "''")}'`;
  }

  private buildCreateTransactionHelperClassSource(
    input: AdtCreateTransactionInput,
    helperClassName: string,
  ): string {
    const transactionCode = normalizeObjectName(input.transactionCode);
    const programName = normalizeObjectName(input.programName);
    const packageName = normalizeObjectName(input.packageName);
    const variantConstant = input.variant
      ? `,\n      lc_variant     TYPE c LENGTH 14 VALUE ${this.toAbapStringLiteral(input.variant)}`
      : "";
    const variantParameter = input.variant
      ? "\n            variant                    = lc_variant"
      : "";

    return `CLASS ${helperClassName} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${helperClassName} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS:
      lc_transaction TYPE tcode VALUE ${this.toAbapStringLiteral(transactionCode)},
      lc_program     TYPE syrepid VALUE ${this.toAbapStringLiteral(programName)},
      lc_shorttext   TYPE tstct-ttext VALUE ${this.toAbapStringLiteral(input.shortText)},
      lc_devclass    TYPE tadir-devclass VALUE ${this.toAbapStringLiteral(packageName)},
      lc_trkorr      TYPE trkorr VALUE ${this.toAbapStringLiteral(input.transportRequest)}${variantConstant}.

    DATA:
      lv_subrc       TYPE sysubrc,
      lv_result      TYPE string,
      lv_exists_flag TYPE c LENGTH 1,
      lv_exception   TYPE string.

    TRY.
        CALL FUNCTION 'RPY_TRANSACTION_INSERT'
          EXPORTING
            program                    = lc_program
${variantParameter}
            transaction                = lc_transaction
            shorttext                  = lc_shorttext
            language                   = sy-langu
            development_class          = lc_devclass
            transport_number           = lc_trkorr
            transaction_type           = 'R'
            suppress_corr_check        = 'X'
            suppress_corr_insert       = 'X'
          EXCEPTIONS
            cancelled                  = 1
            already_exist              = 2
            permission_error           = 3
            name_not_allowed           = 4
            name_conflict              = 5
            illegal_type               = 6
            object_inconsistent        = 7
            db_access_error            = 8
            OTHERS                     = 9.

        lv_subrc = sy-subrc.
        lv_result = SWITCH string( lv_subrc
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'CANCELLED'
          WHEN 2 THEN 'ALREADY_EXIST'
          WHEN 3 THEN 'PERMISSION_ERROR'
          WHEN 4 THEN 'NAME_NOT_ALLOWED'
          WHEN 5 THEN 'NAME_CONFLICT'
          WHEN 6 THEN 'ILLEGAL_TYPE'
          WHEN 7 THEN 'OBJECT_INCONSISTENT'
          WHEN 8 THEN 'DB_ACCESS_ERROR'
          ELSE |SUBRC_{ lv_subrc }| ).

        SELECT SINGLE @abap_true
          FROM tstc
          WHERE tcode = @lc_transaction
          INTO @DATA(lv_exists).

        lv_exists_flag = COND #( WHEN sy-subrc = 0 THEN '1' ELSE '0' ).
        out->write( |MODE=CREATE; TCODE={ lc_transaction }; RESULT={ lv_result }; SUBRC={ lv_subrc }; EXISTS={ lv_exists_flag }| ).
      CATCH cx_root INTO DATA(lx_root).
        lv_exception = lx_root->get_text( ).
        out->write( |MODE=CREATE; TCODE={ lc_transaction }; RESULT=EXCEPTION; TEXT={ lv_exception }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
  }

  private buildDeleteTransactionHelperClassSource(
    input: AdtDeleteTransactionInput,
    helperClassName: string,
  ): string {
    const transactionCode = normalizeObjectName(input.transactionCode);

    return `CLASS ${helperClassName} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${helperClassName} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS:
      lc_transaction TYPE tcode VALUE ${this.toAbapStringLiteral(transactionCode)},
      lc_trkorr      TYPE trkorr VALUE ${this.toAbapStringLiteral(input.transportRequest)}.

    DATA:
      lv_subrc       TYPE sysubrc,
      lv_result      TYPE string,
      lv_exists_flag TYPE c LENGTH 1,
      lv_exception   TYPE string.

    TRY.
        CALL FUNCTION 'RPY_TRANSACTION_DELETE'
          EXPORTING
            transaction                = lc_transaction
            transport_number           = lc_trkorr
            suppress_authority_check   = 'X'
            suppress_corr_insert       = 'X'
            suppress_corr_check        = 'X'
          EXCEPTIONS
            not_excecuted              = 1
            object_not_found           = 2
            OTHERS                     = 3.

        lv_subrc = sy-subrc.
        lv_result = SWITCH string( lv_subrc
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'NOT_EXCECUTED'
          WHEN 2 THEN 'OBJECT_NOT_FOUND'
          ELSE |SUBRC_{ lv_subrc }| ).

        SELECT SINGLE @abap_true
          FROM tstc
          WHERE tcode = @lc_transaction
          INTO @DATA(lv_exists).

        lv_exists_flag = COND #( WHEN sy-subrc = 0 THEN '1' ELSE '0' ).
        out->write( |MODE=DELETE; TCODE={ lc_transaction }; RESULT={ lv_result }; SUBRC={ lv_subrc }; EXISTS={ lv_exists_flag }| ).
      CATCH cx_root INTO DATA(lx_root).
        lv_exception = lx_root->get_text( ).
        out->write( |MODE=DELETE; TCODE={ lc_transaction }; RESULT=EXCEPTION; TEXT={ lv_exception }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
  }

  private buildGetUserParametersHelperClassSource(
    input: AdtGetUserParametersInput,
    helperClassName: string,
  ): string {
    const userName = normalizeObjectName(input.userName ?? this.config.username);
    const filterTableLiteral = this.buildUserParameterIdTableLiteral(input.parameterIds ?? []);

    return `CLASS ${helperClassName} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${helperClassName} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS:
      lc_user      TYPE usr02-bname VALUE ${this.toAbapStringLiteral(userName)},
      lc_with_text TYPE char01 VALUE ${this.toAbapStringLiteral(input.withText === false ? "" : "X")}.

    DATA:
      lt_parameters TYPE ustyp_t_parameters,
      lt_filter     TYPE STANDARD TABLE OF usr05-parid WITH EMPTY KEY,
      lv_count      TYPE i,
      lv_subrc      TYPE sysubrc,
      lv_result     TYPE string,
      lv_exception  TYPE string.

    TRY.
        lt_filter = VALUE ${filterTableLiteral}.

        CALL FUNCTION 'SUSR_USER_PARAMETERS_GET'
          EXPORTING
            user_name           = lc_user
            with_text           = lc_with_text
          TABLES
            user_parameters     = lt_parameters
          EXCEPTIONS
            user_name_not_exist = 1
            OTHERS              = 2.

        lv_subrc = sy-subrc.

        lv_result = SWITCH string( lv_subrc
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'USER_NAME_NOT_EXIST'
          ELSE |SUBRC_{ lv_subrc }| ).

        LOOP AT lt_parameters INTO DATA(ls_parameter).
          IF lt_filter IS NOT INITIAL AND NOT line_exists( lt_filter[ table_line = ls_parameter-parid ] ).
            CONTINUE.
          ENDIF.
          lv_count += 1.
          out->write( |PARAM;PARID={ ls_parameter-parid };PARVA={ ls_parameter-parva };PARTEXT={ ls_parameter-partext }| ).
        ENDLOOP.

        out->write( |MODE=GET; USER={ lc_user }; RESULT={ lv_result }; SUBRC={ lv_subrc }; COUNT={ lv_count }| ).
      CATCH cx_root INTO DATA(lx_root).
        lv_exception = lx_root->get_text( ).
        out->write( |MODE=GET; USER={ lc_user }; RESULT=EXCEPTION; TEXT={ lv_exception }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
  }

  private buildSetUserParametersHelperClassSource(
    input: AdtSetUserParametersInput,
    helperClassName: string,
  ): string {
    const userName = normalizeObjectName(input.userName ?? this.config.username);
    const parameterTableLiteral = this.buildUserParameterValueTableLiteral(input.parameters);
    const filterTableLiteral = this.buildUserParameterIdTableLiteral(
      input.parameters.map((parameter) => parameter.parameterId),
    );

    return `CLASS ${helperClassName} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${helperClassName} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS lc_user TYPE usr02-bname VALUE ${this.toAbapStringLiteral(userName)}.

    DATA:
      lt_before     TYPE ustyp_t_parameters,
      lt_after      TYPE ustyp_t_parameters,
      lt_verify     TYPE ustyp_t_parameters,
      lt_input      TYPE ustyp_t_parameters,
      lt_filter     TYPE STANDARD TABLE OF usr05-parid WITH EMPTY KEY,
      lv_get_subrc  TYPE sysubrc,
      lv_put_subrc  TYPE sysubrc,
      lv_result     TYPE string,
      lv_exception  TYPE string.

    TRY.
        lt_input = VALUE ${parameterTableLiteral}.
        lt_filter = VALUE ${filterTableLiteral}.

        CALL FUNCTION 'SUSR_USER_PARAMETERS_GET'
          EXPORTING
            user_name           = lc_user
            with_text           = 'X'
          TABLES
            user_parameters     = lt_before
          EXCEPTIONS
            user_name_not_exist = 1
            OTHERS              = 2.

        lv_get_subrc = sy-subrc.

        IF lv_get_subrc <> 0.
          lv_result = SWITCH string( lv_get_subrc
            WHEN 1 THEN 'USER_NAME_NOT_EXIST'
            ELSE |SUBRC_{ lv_get_subrc }| ).
          out->write( |MODE=SET; USER={ lc_user }; RESULT={ lv_result }; SUBRC={ lv_get_subrc }; BEFORE_COUNT={ lines( lt_before ) }; AFTER_COUNT={ lines( lt_before ) }| ).
          RETURN.
        ENDIF.

        lt_after = lt_before.

        LOOP AT lt_input INTO DATA(ls_input).
          READ TABLE lt_after WITH KEY parid = ls_input-parid ASSIGNING FIELD-SYMBOL(<ls_after>).
          IF sy-subrc = 0.
            <ls_after>-parva = ls_input-parva.
            IF ls_input-partext IS NOT INITIAL.
              <ls_after>-partext = ls_input-partext.
            ENDIF.
          ELSE.
            APPEND ls_input TO lt_after.
          ENDIF.
        ENDLOOP.

        CALL FUNCTION 'SUSR_USER_PARAMETERS_PUT'
          EXPORTING
            user_name           = lc_user
          TABLES
            user_parameters     = lt_after
          EXCEPTIONS
            user_name_not_exist = 1
            OTHERS              = 2.

        lv_put_subrc = sy-subrc.

        lv_result = SWITCH string( lv_put_subrc
          WHEN 0 THEN 'OK'
          WHEN 1 THEN 'USER_NAME_NOT_EXIST'
          ELSE |SUBRC_{ lv_put_subrc }| ).

        CALL FUNCTION 'SUSR_USER_PARAMETERS_GET'
          EXPORTING
            user_name           = lc_user
            with_text           = 'X'
          TABLES
            user_parameters     = lt_verify
          EXCEPTIONS
            user_name_not_exist = 1
            OTHERS              = 2.

        LOOP AT lt_verify INTO DATA(ls_verify).
          IF lt_filter IS NOT INITIAL AND NOT line_exists( lt_filter[ table_line = ls_verify-parid ] ).
            CONTINUE.
          ENDIF.
          out->write( |PARAM;PARID={ ls_verify-parid };PARVA={ ls_verify-parva };PARTEXT={ ls_verify-partext }| ).
        ENDLOOP.

        out->write( |MODE=SET; USER={ lc_user }; RESULT={ lv_result }; SUBRC={ lv_put_subrc }; BEFORE_COUNT={ lines( lt_before ) }; AFTER_COUNT={ lines( lt_after ) }| ).
      CATCH cx_root INTO DATA(lx_root).
        lv_exception = lx_root->get_text( ).
        out->write( |MODE=SET; USER={ lc_user }; RESULT=EXCEPTION; TEXT={ lv_exception }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
  }

  private buildUserParameterIdTableLiteral(parameterIds: string[]): string {
    if (parameterIds.length === 0) {
      return "#( )";
    }

    const entries = parameterIds
      .map((parameterId) => `( ${this.toAbapStringLiteral(normalizeObjectName(parameterId))} )`)
      .join(" ");
    return `#( ${entries} )`;
  }

  private buildUserParameterValueTableLiteral(parameters: AdtSetUserParametersInput["parameters"]): string {
    const entries = parameters.map((parameter) => {
      const parameterId = normalizeObjectName(parameter.parameterId);
      const parameterValue = parameter.value ?? "";
      const parameterText = parameter.text ?? "";
      return `( parid = ${this.toAbapStringLiteral(parameterId)} parva = ${this.toAbapStringLiteral(parameterValue)} partext = ${this.toAbapStringLiteral(parameterText)} )`;
    }).join(" ");

    return `#( ${entries} )`;
  }

  private ensureTransactionHelperCreateSuccess(
    transactionCode: string,
    responseBody: string,
  ): void {
    const normalizedCode = normalizeObjectName(transactionCode);
    const trimmedBody = trimBody(responseBody, 4000);
    const exceptionText = responseBody.match(/RESULT=EXCEPTION;\s*TEXT=(.+)$/im)?.[1]?.trim();
    if (exceptionText) {
      throw new Error(
        `Create transaction helper failed for ${normalizedCode}.\nSummary: ${exceptionText}\nRaw response:\n${trimmedBody}`,
      );
    }

    const result = responseBody.match(/RESULT=([A-Z_0-9]+)/i)?.[1]?.toUpperCase();
    const subrc = responseBody.match(/SUBRC=(\d+)/i)?.[1];
    const exists = responseBody.match(/EXISTS=([01])/i)?.[1];

    if (result === "OK" && subrc === "0" && exists === "1") {
      return;
    }

    const category = result === "ALREADY_EXIST" ? "already_exists" : "create_failed";
    throw new Error(
      `Create transaction helper failed for ${normalizedCode}.\nCategory: ${category}\nSummary: RESULT=${result ?? "UNKNOWN"} SUBRC=${subrc ?? "?"} EXISTS=${exists ?? "?"}\nRaw response:\n${trimmedBody}`,
    );
  }

  private ensureTransactionHelperDeleteSuccess(
    transactionCode: string,
    responseBody: string,
  ): void {
    const normalizedCode = normalizeObjectName(transactionCode);
    const trimmedBody = trimBody(responseBody, 4000);
    const exceptionText = responseBody.match(/RESULT=EXCEPTION;\s*TEXT=(.+)$/im)?.[1]?.trim();
    if (exceptionText) {
      throw new Error(
        `Delete transaction helper failed for ${normalizedCode}.\nSummary: ${exceptionText}\nRaw response:\n${trimmedBody}`,
      );
    }

    const result = responseBody.match(/RESULT=([A-Z_0-9]+)/i)?.[1]?.toUpperCase();
    const subrc = responseBody.match(/SUBRC=(\d+)/i)?.[1];
    const exists = responseBody.match(/EXISTS=([01])/i)?.[1];

    if (result === "OK" && subrc === "0" && exists === "0") {
      return;
    }

    throw new Error(
      `Delete transaction helper failed for ${normalizedCode}.\nCategory: delete_failed\nSummary: RESULT=${result ?? "UNKNOWN"} SUBRC=${subrc ?? "?"} EXISTS=${exists ?? "?"}\nRaw response:\n${trimmedBody}`,
    );
  }

  private ensureUserParameterHelperSuccess(
    mode: "GET" | "SET",
    userName: string,
    responseBody: string,
  ): void {
    const normalizedUser = normalizeObjectName(userName);
    const trimmedBody = trimBody(responseBody, 4000);
    const exceptionText = responseBody.match(/RESULT=EXCEPTION;\s*TEXT=(.+)$/im)?.[1]?.trim();
    if (exceptionText) {
      throw new Error(
        `${mode} user parameters helper failed for ${normalizedUser}.\nSummary: ${exceptionText}\nRaw response:\n${trimmedBody}`,
      );
    }

    const result = responseBody.match(/RESULT=([A-Z_0-9]+)/i)?.[1]?.toUpperCase();
    const subrc = responseBody.match(/SUBRC=(\d+)/i)?.[1];

    if (result === "OK" && subrc === "0") {
      return;
    }

    const category = result === "USER_NAME_NOT_EXIST" ? "user_not_found" : "helper_failed";
    throw new Error(
      `${mode} user parameters helper failed for ${normalizedUser}.\nCategory: ${category}\nSummary: RESULT=${result ?? "UNKNOWN"} SUBRC=${subrc ?? "?"}\nRaw response:\n${trimmedBody}`,
    );
  }

  private buildSearchHelpHelperProgramSource(
    input: AdtCreateSearchHelpInput,
    helperProgramName: string,
  ): string {
    const searchHelpName = normalizeObjectName(input.searchHelpName);
    const selectionMethod = normalizeObjectName(input.selectionMethod);
    const keyFieldName = normalizeObjectName(input.keyFieldName);
    const description = input.description.replaceAll("'", "''");
    const packageName = normalizeObjectName(input.packageName);
    const masterSystem = (input.masterSystem ?? this.config.defaultMasterSystem).replaceAll("'", "''");

    return `REPORT ${helperProgramName.toLowerCase()}.

CONSTANTS:
  lc_shlp    TYPE ddobjname VALUE '${searchHelpName}',
  lc_package TYPE tadir-devclass VALUE '${packageName}',
  lc_table   TYPE ddobjname VALUE '${selectionMethod}',
  lc_field   TYPE fieldname VALUE '${keyFieldName}'.

DATA:
  ls_dd30v TYPE dd30v,
  lt_dd31v TYPE STANDARD TABLE OF dd31v,
  lt_dd32p TYPE STANDARD TABLE OF dd32p,
  lt_dd33v TYPE STANDARD TABLE OF dd33v,
  lt_dd03p TYPE STANDARD TABLE OF dd03p,
  ls_dd02v TYPE dd02v,
  ls_dd09v TYPE dd09v,
  lv_state TYPE ddgotstate,
  lv_rc    TYPE sy-subrc,
  ls_tadir TYPE tadir,
  lt_tadir TYPE STANDARD TABLE OF tadir.

CALL FUNCTION 'DDIF_TABL_GET'
  EXPORTING
    name      = lc_table
    state     = 'A'
    langu     = sy-langu
  IMPORTING
    dd02v_wa  = ls_dd02v
    dd09l_wa  = ls_dd09v
    gotstate  = lv_state
  TABLES
    dd03p_tab = lt_dd03p
  EXCEPTIONS
    illegal_input = 1
    OTHERS        = 2.

WRITE: / 'TABL_GET', sy-subrc, lv_state.
IF sy-subrc <> 0.
  RETURN.
ENDIF.

CLEAR ls_dd30v.
ls_dd30v-shlpname   = lc_shlp.
ls_dd30v-ddlanguage = sy-langu.
ls_dd30v-ddtext     = '${description}'.
ls_dd30v-issimple   = 'X'.
ls_dd30v-selmethod  = lc_table.
ls_dd30v-selmtype   = 'T'.
ls_dd30v-dialogtype = 'D'.

LOOP AT lt_dd03p ASSIGNING FIELD-SYMBOL(<ls_dd03p>)
  WHERE fieldname = lc_field.
  APPEND INITIAL LINE TO lt_dd32p ASSIGNING FIELD-SYMBOL(<ls_dd32p>).
  <ls_dd32p>-shlpname   = lc_shlp.
  <ls_dd32p>-fieldname  = <ls_dd03p>-fieldname.
  <ls_dd32p>-flposition = sy-tabix.
  <ls_dd32p>-rollname   = <ls_dd03p>-rollname.
  <ls_dd32p>-sqltab     = lc_table.
  <ls_dd32p>-indexname  = '0'.
  <ls_dd32p>-datatype   = <ls_dd03p>-datatype.
  <ls_dd32p>-leng       = <ls_dd03p>-leng.
  <ls_dd32p>-outputlen  = <ls_dd03p>-outputlen.
  <ls_dd32p>-decimals   = <ls_dd03p>-decimals.
  <ls_dd32p>-lowercase  = <ls_dd03p>-lowercase.
  <ls_dd32p>-convexit   = <ls_dd03p>-convexit.
  <ls_dd32p>-shlpinput  = 'X'.
  <ls_dd32p>-shlpoutput = 'X'.
  <ls_dd32p>-shlpselpos = 1.
  <ls_dd32p>-shlplispos = sy-tabix.
ENDLOOP.

IF lt_dd32p IS INITIAL.
  WRITE: / 'FIELD_NOT_FOUND', lc_field.
  RETURN.
ENDIF.

WRITE: / 'PARAMS', lines( lt_dd32p ).

CALL FUNCTION 'DDIF_SHLP_PUT'
  EXPORTING
    name      = lc_shlp
    dd30v_wa  = ls_dd30v
  TABLES
    dd31v_tab = lt_dd31v
    dd32p_tab = lt_dd32p
    dd33v_tab = lt_dd33v
  EXCEPTIONS
    name_inconsistent = 1
    put_failure       = 2
    put_refused       = 3
    shlp_inconsistent = 4
    shlp_not_found    = 5
    OTHERS            = 6.

WRITE: / 'SHLP_PUT', sy-subrc.
IF sy-subrc <> 0.
  RETURN.
ENDIF.

ls_tadir-pgmid      = 'R3TR'.
ls_tadir-object     = 'SHLP'.
ls_tadir-obj_name   = lc_shlp.
ls_tadir-devclass   = lc_package.
ls_tadir-srcsystem  = '${masterSystem}'.
ls_tadir-author     = sy-uname.
ls_tadir-masterlang = sy-langu.

CALL FUNCTION 'TRINT_TADIR_INSERT'
  EXPORTING
    pgmid      = ls_tadir-pgmid
    object     = ls_tadir-object
    obj_name   = ls_tadir-obj_name
    devclass   = ls_tadir-devclass
    srcsystem  = ls_tadir-srcsystem
    author     = ls_tadir-author
    masterlang = ls_tadir-masterlang
  IMPORTING
    es_tadir   = ls_tadir
  EXCEPTIONS
    object_exists_global = 1
    object_exists_local  = 2
    OTHERS               = 3.

WRITE: / 'TADIR_INSERT', sy-subrc.
IF sy-subrc <> 0 AND sy-subrc <> 1 AND sy-subrc <> 2.
  RETURN.
ENDIF.

CALL FUNCTION 'DDIF_SHLP_ACTIVATE'
  EXPORTING
    name        = lc_shlp
  IMPORTING
    rc          = lv_rc
  EXCEPTIONS
    not_found   = 1
    put_failure = 2
    OTHERS      = 3.

WRITE: / 'SHLP_ACT', sy-subrc, lv_rc.

CLEAR: ls_dd30v, lt_dd31v, lt_dd32p, lt_dd33v, lv_state.

CALL FUNCTION 'DDIF_SHLP_GET'
  EXPORTING
    name      = lc_shlp
    state     = 'A'
    langu     = sy-langu
  IMPORTING
    gotstate  = lv_state
    dd30v_wa  = ls_dd30v
  TABLES
    dd31v_tab = lt_dd31v
    dd32p_tab = lt_dd32p
    dd33v_tab = lt_dd33v
  EXCEPTIONS
    illegal_value = 1
    op_failure    = 2
    OTHERS        = 3.

WRITE: / 'SHLP_GET', sy-subrc, lv_state, ls_dd30v-shlpname, ls_dd30v-selmethod.
WRITE: / 'SHLP_GET_PARAMS', lines( lt_dd32p ).

CLEAR lt_tadir.
SELECT pgmid, object, obj_name, devclass
  FROM tadir
  WHERE obj_name = @lc_shlp
  INTO TABLE @lt_tadir.

LOOP AT lt_tadir ASSIGNING FIELD-SYMBOL(<ls_tadir_out>).
  WRITE: / 'TADIR', <ls_tadir_out>-pgmid, <ls_tadir_out>-object, <ls_tadir_out>-obj_name, <ls_tadir_out>-devclass.
ENDLOOP.`;
  }

  private buildCorrNrQuery(transportRequest?: string): string {
    if (!transportRequest) {
      return "";
    }
    return new URLSearchParams({ corrNr: transportRequest }).toString();
  }

  private buildLockQuery(lockHandle: string, transportRequest?: string): string {
    const params = new URLSearchParams({ lockHandle });
    if (transportRequest) {
      params.set("corrNr", transportRequest);
    }
    return params.toString();
  }

  private ensureSuccess(response: AdtResponseSummary, message: string): void {
    if (response.status >= 200 && response.status < 300) {
      return;
    }
    throw new Error(`${message}: ${response.status} ${response.statusText}\n${response.body}`);
  }

  private ensureCreateSuccess(response: AdtResponseSummary, objectKind: string, objectName: string): void {
    if (response.status >= 200 && response.status < 300) {
      return;
    }

    const exceptionInfo = this.parseAdtException(response.body);
    const category = this.classifyCreateFailure(response, exceptionInfo);
    const summary =
      exceptionInfo.message
      ?? exceptionInfo.localizedMessage
      ?? `${response.status} ${response.statusText}`;

    const lines = [
      `Create failed for ${objectKind} ${objectName}.`,
      `Category: ${category}`,
      `Summary: ${summary}`,
    ];

    if (exceptionInfo.typeId) {
      lines.push(`ADT exception type: ${exceptionInfo.typeId}`);
    }

    lines.push("Raw response:");
    lines.push(trimBody(response.body, 4000));

    throw new Error(lines.join("\n"));
  }

  private isSessionTimedOutResponse(response: AdtResponseSummary): boolean {
    if (response.status !== 400) {
      return false;
    }

    const responseBody = response.body.toLowerCase();
    return responseBody.includes("session timed out") || responseBody.includes("session no longer exists");
  }

  private resetSession(session: SessionState): void {
    session.csrfToken = undefined;
    session.cookies.clear();
  }

  private async resolveEffectiveTransportRequest(explicitTransportRequest?: string): Promise<string | undefined> {
    if (explicitTransportRequest) {
      return normalizeObjectName(explicitTransportRequest);
    }

    const fallbackTransportRequest = this.config.defaultTransportRequest
      ? normalizeObjectName(this.config.defaultTransportRequest)
      : undefined;

    const modifiableRequests = await this.listModifiableWorkbenchRequests();
    if (fallbackTransportRequest) {
      const matchingFallback = modifiableRequests.find(
        (request) => request["tm:number"] === fallbackTransportRequest,
      );
      if (matchingFallback) {
        return fallbackTransportRequest;
      }
    }

    if (modifiableRequests.length === 1) {
      return modifiableRequests[0]["tm:number"];
    }

    if (modifiableRequests.length > 1) {
      const requestNumbers = modifiableRequests
        .map((request) => request["tm:number"])
        .filter((value): value is string => Boolean(value));
      throw new Error(
        `Multiple modifiable workbench requests found for ${normalizeObjectName(this.config.username)}: ${requestNumbers.join(", ")}. ` +
        `Specify transportRequest explicitly or set SAP_ADT_DEFAULT_TRANSPORT_REQUEST to one of them.`,
      );
    }

    return undefined;
  }

  private async listModifiableWorkbenchRequests(): Promise<Array<Record<string, string>>> {
    const response = await this.listTransportRequests({
      owner: this.config.username,
      requestStatus: "D",
      requestType: "K",
    });

    this.ensureSuccess(
      response,
      `Failed to list modifiable workbench requests for ${normalizeObjectName(this.config.username)}`,
    );

    return parseTransportRequestList(response.body).filter(
      (request) => request["tm:status"] === "D" && request["tm:type"] === "K",
    );
  }

  private async canContinueAfterCreateLock(
    response: AdtResponseSummary,
    objectType: SupportedObjectType,
    objectName: string,
    containerName?: string,
  ): Promise<boolean> {
    if (response.status >= 200 && response.status < 300) {
      return false;
    }

    const responseBody = response.body.toLowerCase();
    if (
      !responseBody.includes("already locked in request")
      || !responseBody.includes(objectName.toLowerCase())
      || !responseBody.includes(this.config.username.toLowerCase())
    ) {
      return false;
    }

    try {
      const existingObject = await this.readObject({
        objectType,
        objectName,
        containerName,
      });
      return existingObject.status >= 200 && existingObject.status < 300;
    } catch {
      return false;
    }
  }

  private parseAdtException(body: string): {
    typeId?: string;
    message?: string;
    localizedMessage?: string;
  } {
    const typeId = body.match(/<(?:\w+:)?type\b[^>]*id="([^"]+)"/i)?.[1];
    const message = body.match(/<(?:\w+:)?message\b[^>]*>([\s\S]*?)<\/(?:\w+:)?message>/i)?.[1];
    const localizedMessage = body.match(
      /<(?:\w+:)?localizedMessage\b[^>]*>([\s\S]*?)<\/(?:\w+:)?localizedMessage>/i,
    )?.[1];

    return {
      typeId,
      message,
      localizedMessage,
    };
  }

  private classifyCreateFailure(
    response: AdtResponseSummary,
    exceptionInfo: { typeId?: string; message?: string; localizedMessage?: string },
  ): string {
    const combined = [
      exceptionInfo.typeId ?? "",
      exceptionInfo.message ?? "",
      exceptionInfo.localizedMessage ?? "",
      response.body,
    ].join("\n").toLowerCase();

    if (
      combined.includes("already exists")
      || combined.includes("does already exist")
      || combined.includes("exceptionresourcealreadyexists")
    ) {
      return "already_exists";
    }

    if (
      combined.includes("locked")
      || combined.includes("request")
      || combined.includes("transport")
      || combined.includes("corrnr")
    ) {
      return "lock_or_transport_error";
    }

    return "create_failed";
  }

  private async request(
    method: string,
    uri: string,
    options: RequestOptions = {},
  ): Promise<AdtResponseSummary> {
    const stateful = options.stateful ?? false;
    const session = options.session ?? (stateful ? this.statefulSession : this.statelessSession);
    const target = uri.startsWith("http") ? uri : `${this.config.adtBaseUrl}${uri}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "*/*",
        "User-Agent": "sap-adt-mcp/0.9.0",
        ...(options.headers ?? {}),
      };

      if (options.includeAuth !== false) {
        headers.Authorization = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`;
      }

      if (stateful) {
        headers["X-sap-adt-sessiontype"] = "stateful";
      }

      if (method !== "GET" && method !== "HEAD" && !session.csrfToken) {
        await this.fetchCsrfToken(session, stateful);
      }

      if (session.csrfToken && method !== "GET" && method !== "HEAD") {
        headers["X-CSRF-Token"] = session.csrfToken;
      }

      const refreshedInitialCookieHeader = this.formatCookies(session);
      if (refreshedInitialCookieHeader) {
        headers.Cookie = refreshedInitialCookieHeader;
      }

      let response = await fetch(target, {
        method,
        body: options.body,
        headers,
        signal: controller.signal,
        // @ts-expect-error undici dispatcher is supported in Node fetch
        dispatcher: this.dispatcher,
      });

      this.captureResponseState(response, session);

      if ((response.status === 403 || response.status === 400) && method !== "GET" && !session.csrfToken) {
        await this.fetchCsrfToken(session, stateful);
        headers["X-CSRF-Token"] = session.csrfToken ?? "";
        const refreshedCookieHeader = this.formatCookies(session);
        if (refreshedCookieHeader) {
          headers.Cookie = refreshedCookieHeader;
        }
        response = await fetch(target, {
          method,
          body: options.body,
          headers,
          signal: controller.signal,
          // @ts-expect-error undici dispatcher is supported in Node fetch
          dispatcher: this.dispatcher,
        });
        this.captureResponseState(response, session);
      }

      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchCsrfToken(session: SessionState, stateful: boolean): Promise<void> {
    const target = `${this.config.adtBaseUrl}/discovery`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
      Accept: "*/*",
      "User-Agent": "sap-adt-mcp/0.9.0",
      "X-CSRF-Token": "Fetch",
    };

    if (stateful) {
      headers["X-sap-adt-sessiontype"] = "stateful";
    }

    const cookieHeader = this.formatCookies(session);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(target, {
      method: "GET",
      headers,
      // @ts-expect-error undici dispatcher is supported in Node fetch
      dispatcher: this.dispatcher,
    });

    this.captureResponseState(response, session);
    await response.text();
  }

  private captureResponseState(response: Response, session: SessionState): void {
    const csrf = response.headers.get("x-csrf-token");
    if (csrf && csrf.toLowerCase() !== "required") {
      session.csrfToken = csrf;
    }

    const rawSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const cookie of rawSetCookie) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator > 0) {
        session.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  private formatCookies(session: SessionState): string | undefined {
    if (session.cookies.size === 0) {
      return undefined;
    }

    return Array.from(session.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}
