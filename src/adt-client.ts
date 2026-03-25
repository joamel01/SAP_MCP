import { Agent } from "undici";
import type {
  AdtActivationRequest,
  AdtCreateClassInput,
  AdtCreateDclsInput,
  AdtCreateDataElementInput,
  AdtCreateDdlsInput,
  AdtCreateDdlxInput,
  AdtCreateDomainInput,
  AdtCreatePackageInput,
  AdtCreateProgramInput,
  AdtCreateSearchHelpInput,
  AdtCreateScaffoldInput,
  AdtCreateTransportRequestInput,
  AdtDeleteTransportRequestInput,
  AdtGetTransportRequestInput,
  AdtListTransportRequestsInput,
  AdtReleaseTransportRequestInput,
  AdtSafeReleaseTransportRequestInput,
  AdtRunClassInput,
  AdtRunProgramInput,
  AdtReadSearchHelpInput,
  AdtCreateStructureInput,
  AdtCreateTableInput,
  AdtCreateTableTypeInput,
  AdtDeleteObjectInput,
  AdtRunAbapUnitInput,
  DeletableObjectType,
  AdtLockResult,
  AdtResponseSummary,
  ServerConfig,
  SupportedObjectType,
} from "./types.js";
import {
  applyTemplate,
  normalizeObjectName,
  parseTransportRequestList,
  parseXmlAttribute,
  parseXmlTag,
  truncateObjectName,
  xmlEscape,
} from "./utils.js";

export interface ReadObjectInput {
  objectType: SupportedObjectType;
  objectName?: string;
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
    const uri = this.resolveObjectUri(input.objectType, input.objectName, input.uri);
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
    const uri = this.resolveObjectUri(input.objectType, input.objectName, input.uri);
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
          uri: this.toDefinitionIdentifierUri(input.objectType, input.objectName, uri),
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
    const deleteUri = this.resolveDeleteUri(input.objectType, input.objectName, input.uri);
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
      this.ensureSuccess(response, `Failed to create program ${normalizedName}`);
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
      this.ensureSuccess(response, `Failed to create class ${normalizedName}`);
    }
    await this.activateObject({
      uri: `/oo/classes/${normalizedName.toLowerCase()}`,
      name: normalizedName,
      type: "CLAS/OC",
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
      this.ensureSuccess(response, `Failed to create DDLS ${normalizedName}`);
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
      this.ensureSuccess(response, `Failed to create DCLS ${normalizedName}`);
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
      this.ensureSuccess(response, `Failed to create DDLX ${normalizedName}`);
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
    this.ensureSuccess(createResponse, `Failed to create data element ${normalizedName}`);

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
    this.ensureSuccess(createResponse, `Failed to create table ${normalizedName}`);

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
    this.ensureSuccess(createResponse, `Failed to create table type ${normalizedName}`);

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
    this.ensureSuccess(createResponse, `Failed to create domain ${normalizedName}`);

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
    this.ensureSuccess(createResponse, `Failed to create structure ${normalizedName}`);

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
    const activationUri = this.toAbsoluteAdtUri(request.uri);
    const activationType = request.type ?? this.inferActivationObjectType(activationUri);
    const activationParentUri = request.parentUri ? this.toAbsoluteAdtUri(request.parentUri) : undefined;
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">` +
      `<adtcore:objectReference adtcore:uri="${activationUri}"` +
      `${activationType ? ` adtcore:type="${activationType}"` : ""}` +
      `${activationParentUri ? ` adtcore:parentUri="${activationParentUri}"` : ""}` +
      `${request.name ? ` adtcore:name="${normalizeObjectName(request.name)}"` : ""}` +
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
      throw new Error(`ADT activation run did not return a response for ${request.name ?? request.uri}`);
    }

    this.ensureSuccess(
      activationRun,
      `Failed to start activation for ${request.name ?? request.uri}`,
    );

    const runLocation = activationRun.headers.location ?? activationRun.headers["content-location"];
    if (!runLocation) {
      throw new Error(`ADT activation run did not return a run location for ${request.name ?? request.uri}`);
    }

    const relativeRunLocation = runLocation.replace(/^https?:\/\/[^/]+/, "").replace("/sap/bc/adt", "");
    const finalRun = await this.waitForActivationRun(relativeRunLocation);

    if (request.name) {
      const inactiveObjects = await this.getActivationLog();
      if (inactiveObjects.body.includes(`adtcore:name="${normalizeObjectName(request.name)}"`)) {
        throw new Error(
          `Activation finished but object ${normalizeObjectName(request.name)} is still inactive.\n${finalRun.body}`,
        );
      }
    }

    return finalRun;
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

  private resolveObjectUri(
    objectType: SupportedObjectType,
    objectName?: string,
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
    });
  }

  private toDefinitionIdentifierUri(
    objectType: SupportedObjectType,
    objectName: string | undefined,
    sourceUri: string,
  ): string {
    if (!objectName) {
      return sourceUri.replace(/\/source\/main$/, "");
    }

    const normalized = normalizeObjectName(objectName).toLowerCase();
    switch (objectType) {
      case "class":
        return `/oo/classes/${normalized}`;
      case "program":
        return `/programs/programs/${normalized}`;
      case "ddls":
        return `/ddic/ddl/sources/${normalized}`;
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
      case "class":
        return "CLAS/OC";
      case "program":
        return "PROG/P";
      case "ddls":
        return "DDLS/DF";
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

    if (normalizedUri.includes("/oo/classes/")) {
      return "CLAS/OC";
    }
    if (normalizedUri.includes("/programs/programs/")) {
      return "PROG/P";
    }
    if (normalizedUri.includes("/ddic/ddl/sources/")) {
      return "DDLS/DF";
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
          this.resolveObjectUri(objectType, objectName),
        );
    }
  }

  private resolveDeleteLockUri(objectType: DeletableObjectType, deleteUri: string): string {
    switch (objectType) {
      case "class":
      case "program":
      case "ddls":
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
      });
      return existingObject.status >= 200 && existingObject.status < 300;
    } catch {
      return false;
    }
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
