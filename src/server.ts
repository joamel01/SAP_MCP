import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AdtClient } from "./adt-client.js";
import { assertAllowedObjectType, assertAllowedPackage } from "./authorization.js";
import { loadConfig } from "./config.js";
import type { DeletableObjectType, SupportedObjectType } from "./types.js";
import {
  parseAbapUnitResult,
  parseRuntimeOutput,
  parseTransportRequestDetail,
  parseTransportRequestList,
  trimBody,
} from "./utils.js";

const config = loadConfig();
const adtClient = new AdtClient(config);

const server = new McpServer({
  name: "sap-adt-mcp",
  version: "1.3.0",
});

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

type TransportClassification = "keep" | "release" | "delete" | "review";

function classifyTransportRequest(
  request: Record<string, string> | undefined,
  tasks: Array<Record<string, string>>,
  objects: Array<Record<string, string>>,
  keepRequestNumbers: Set<string>,
): { classification: TransportClassification; reason: string } {
  const requestNumber = request?.["tm:number"] ?? "";
  const description = (request?.["tm:desc"] ?? "").toLowerCase();
  const status = request?.["tm:status"] ?? "";
  const objectCount = objects.length;
  const releasedTasks = tasks.length > 0 && tasks.every((task) => task["tm:status"] === "R");

  if (keepRequestNumbers.has(requestNumber)) {
    return { classification: "keep", reason: "explicit_keep" };
  }
  if (status === "R") {
    return { classification: "keep", reason: "already_released" };
  }
  if (description.includes("mcp e2e")) {
    return { classification: "keep", reason: "reference_request" };
  }
  if (objectCount === 0) {
    return { classification: "delete", reason: "empty_modifiable_request" };
  }
  if (releasedTasks) {
    return { classification: "release", reason: "all_tasks_released_request_still_modifiable" };
  }
  if (description.includes("generated request for change recording")) {
    return { classification: "review", reason: "generated_request_with_objects" };
  }
  return { classification: "review", reason: "non_empty_modifiable_request" };
}

server.tool(
  "sap_adt_discover",
  "Verify ADT connectivity and return raw discovery information from the configured SAP system.",
  {},
  async () => {
    const response = await adtClient.discoverSystem();
    return textResult(JSON.stringify(response, null, 2));
  },
);

server.tool(
  "sap_adt_read_object",
  "Read an ABAP repository object via SAP ADT. Supply either a direct ADT uri or objectType+objectName.",
  {
    objectType: z.enum(["class", "program", "ddls", "dcls", "ddlx"]),
    objectName: z.string().optional(),
    uri: z.string().optional(),
    packageName: z.string().optional(),
  },
  async ({ objectType, objectName, uri, packageName }) => {
    assertAllowedObjectType(config, objectType);
    assertAllowedPackage(config, packageName);

    const response = await adtClient.readObject({
      objectType: objectType as SupportedObjectType,
      objectName,
      uri,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_search_help",
  "Create a simple elementary DDIC search help through a verified helper-program flow. Current verified scope is one indexed base-table field.",
  {
    searchHelpName: z.string(),
    description: z.string(),
    packageName: z.string(),
    selectionMethod: z.string(),
    keyFieldName: z.string(),
    helperProgramName: z.string().optional(),
    masterSystem: z.string().optional(),
    abapLanguageVersion: z.string().optional(),
    transportRequest: z.string().optional(),
    deleteHelperAfterRun: z.boolean().optional(),
  },
  async ({
    searchHelpName,
    description,
    packageName,
    selectionMethod,
    keyFieldName,
    helperProgramName,
    masterSystem,
    abapLanguageVersion,
    transportRequest,
    deleteHelperAfterRun,
  }) => {
    assertAllowedPackage(config, packageName);

    const responses = await adtClient.createSearchHelp({
      searchHelpName,
      description,
      packageName,
      selectionMethod,
      keyFieldName,
      helperProgramName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      abapLanguageVersion: abapLanguageVersion ?? config.defaultAbapLanguageVersion,
      transportRequest,
      deleteHelperAfterRun,
    });

    return textResult(JSON.stringify(
      responses.map((response, index) => ({
        step: index + 1,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: trimBody(response.body),
      })),
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_read_search_help",
  "Read basic ADT metadata for a DDIC search help via the verified VIT workbench URI.",
  {
    searchHelpName: z.string(),
  },
  async ({ searchHelpName }) => {
    const response = await adtClient.readSearchHelp({ searchHelpName });
    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_run_program",
  "Run an executable ABAP program via SAP ADT programrun and return both the raw output and a compact CLI-friendly summary when feasible.",
  {
    programName: z.string(),
    profilerId: z.string().optional(),
    packageName: z.string().optional(),
  },
  async ({ programName, profilerId, packageName }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.runProgram({
      programName,
      profilerId,
    });

    const body = trimBody(response.body);
    const parsedOutput = parseRuntimeOutput(response.body);

    return textResult(JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        parsedOutput,
        body,
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_run_class",
  "Run an ABAP class via SAP ADT classrun and return both the raw output and a compact CLI-friendly summary when feasible.",
  {
    className: z.string(),
    profilerId: z.string().optional(),
    packageName: z.string().optional(),
  },
  async ({ className, profilerId, packageName }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.runClass({
      className,
      profilerId,
    });

    const body = trimBody(response.body);
    const parsedOutput = parseRuntimeOutput(response.body);

    return textResult(JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        parsedOutput,
        body,
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_auto_verify_object",
  "Run one safe post-activation verification step for a known runnable artifact. In auto mode, programs use programrun and classes use classrun. ABAP Unit can be selected explicitly.",
  {
    objectType: z.enum(["class", "program"]),
    objectName: z.string(),
    packageName: z.string().optional(),
    verificationMode: z.enum(["auto", "runtime", "abapUnit"]).optional(),
    profilerId: z.string().optional(),
    withNavigationUri: z.boolean().optional(),
  },
  async ({ objectType, objectName, packageName, verificationMode, profilerId, withNavigationUri }) => {
    assertAllowedPackage(config, packageName);

    const mode = verificationMode ?? "auto";
    if (mode === "abapUnit") {
      const response = await adtClient.runAbapUnit({
        objectType,
        objectName,
        withNavigationUri,
      });

      return textResult(JSON.stringify(
        {
          verificationMode: "abapUnit",
          objectType,
          objectName,
          status: response.status,
          statusText: response.statusText,
          parsedResult: parseAbapUnitResult(response.body),
          body: trimBody(response.body),
        },
        null,
        2,
      ));
    }

    if (objectType === "program") {
      const response = await adtClient.runProgram({
        programName: objectName,
        profilerId,
      });

      return textResult(JSON.stringify(
        {
          verificationMode: "programrun",
          objectType,
          objectName,
          status: response.status,
          statusText: response.statusText,
          parsedOutput: parseRuntimeOutput(response.body),
          body: trimBody(response.body),
        },
        null,
        2,
      ));
    }

    const response = await adtClient.runClass({
      className: objectName,
      profilerId,
    });

    return textResult(JSON.stringify(
      {
        verificationMode: "classrun",
        objectType,
        objectName,
        status: response.status,
        statusText: response.statusText,
        parsedOutput: parseRuntimeOutput(response.body),
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_get_abap_unit_metadata",
  "Read SAP ADT ABAP Unit metadata for the current system, including supported object types and execution limits.",
  {},
  async () => {
    const response = await adtClient.getAbapUnitMetadata();

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_run_abap_unit",
  "Run ABAP Unit via SAP ADT for one class or executable program and return the raw XML result plus a compact structured summary when the payload supports it.",
  {
    objectType: z.enum(["class", "program"]),
    objectName: z.string().optional(),
    uri: z.string().optional(),
    packageName: z.string().optional(),
    assignedTests: z.boolean().optional(),
    sameProgram: z.boolean().optional(),
    withNavigationUri: z.boolean().optional(),
    harmlessRiskLevel: z.boolean().optional(),
    dangerousRiskLevel: z.boolean().optional(),
    criticalRiskLevel: z.boolean().optional(),
    shortDuration: z.boolean().optional(),
    mediumDuration: z.boolean().optional(),
    longDuration: z.boolean().optional(),
  },
  async ({
    objectType,
    objectName,
    uri,
    packageName,
    assignedTests,
    sameProgram,
    withNavigationUri,
    harmlessRiskLevel,
    dangerousRiskLevel,
    criticalRiskLevel,
    shortDuration,
    mediumDuration,
    longDuration,
  }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.runAbapUnit({
      objectType,
      objectName,
      uri,
      assignedTests,
      sameProgram,
      withNavigationUri,
      harmlessRiskLevel,
      dangerousRiskLevel,
      criticalRiskLevel,
      shortDuration,
      mediumDuration,
      longDuration,
    });

    const body = trimBody(response.body);
    const parsedResult = parseAbapUnitResult(response.body);

    return textResult(JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        parsedResult,
        body,
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_write_object",
  "Write ABAP repository content via SAP ADT using a stateful session, lock, corrNr handling and optional activation.",
  {
    objectType: z.enum(["class", "program", "ddls", "dcls", "ddlx"]),
    objectName: z.string().optional(),
    uri: z.string().optional(),
    packageName: z.string().optional(),
    content: z.string(),
    transportRequest: z.string().optional(),
    activateAfterWrite: z.boolean().optional(),
  },
  async ({ objectType, objectName, uri, packageName, content, transportRequest, activateAfterWrite }) => {
    assertAllowedObjectType(config, objectType);
    assertAllowedPackage(config, packageName);

    const response = await adtClient.writeObject({
      objectType: objectType as SupportedObjectType,
      objectName,
      uri,
      content,
      transportRequest,
      activateAfterWrite,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_activate_object",
  "Activate an ABAP repository object via SAP ADT. Supply either objectType+objectName or a direct ADT uri. Source uris are normalized automatically.",
  {
    objectType: z.enum(["class", "program", "ddls", "dcls", "ddlx"]).optional(),
    objectName: z.string().optional(),
    uri: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    parentUri: z.string().optional(),
    packageName: z.string().optional(),
  },
  async ({ objectType, objectName, uri, name, type, parentUri, packageName }) => {
    if (objectType) {
      assertAllowedObjectType(config, objectType);
    }
    assertAllowedPackage(config, packageName);

    const response = await adtClient.activateObject({
      objectType: objectType as SupportedObjectType | undefined,
      objectName,
      uri,
      name,
      type,
      parentUri,
    });
    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_activate_dependency_chain",
  "Activate a small known dependency chain in a deterministic SAP-friendly order. Use this when the caller already knows the affected objects but should not have to decide the activation sequence.",
  {
    orderProfile: z.enum(["auto", "consumerProgram", "consumptionView"]).optional(),
    objects: z.array(
      z.object({
        objectType: z.enum(["class", "program", "ddls", "dcls", "ddlx"]),
        objectName: z.string().optional(),
        uri: z.string().optional(),
        packageName: z.string().optional(),
      }),
    ).min(1),
  },
  async ({ orderProfile, objects }) => {
    for (const item of objects) {
      assertAllowedObjectType(config, item.objectType);
      assertAllowedPackage(config, item.packageName);
    }

    const results = await adtClient.activateDependencyChain({
      orderProfile,
      objects: objects.map((item) => ({
        objectType: item.objectType as SupportedObjectType,
        objectName: item.objectName,
        uri: item.uri,
        packageName: item.packageName,
      })),
    });

    return textResult(JSON.stringify(
      results.map((item) => ({
        requestedOrder: item.requestedOrder,
        executionOrder: item.executionOrder,
        objectType: item.objectType,
        objectName: item.objectName,
        uri: item.uri,
        status: item.response.status,
        statusText: item.response.statusText,
        body: trimBody(item.response.body),
      })),
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_activate_object_set",
  "Activate a small mixed object set in deterministic order. Use stopOnError=false when you want a full per-object result instead of halting at the first activation failure.",
  {
    orderProfile: z.enum(["auto", "consumerProgram", "consumptionView"]).optional(),
    stopOnError: z.boolean().optional(),
    objects: z.array(
      z.object({
        objectType: z.enum(["class", "program", "ddls", "dcls", "ddlx"]),
        objectName: z.string().optional(),
        uri: z.string().optional(),
        packageName: z.string().optional(),
      }),
    ).min(1),
  },
  async ({ orderProfile, stopOnError, objects }) => {
    for (const item of objects) {
      assertAllowedObjectType(config, item.objectType);
      assertAllowedPackage(config, item.packageName);
    }

    const result = await adtClient.activateObjectSet({
      orderProfile,
      stopOnError,
      objects: objects.map((item) => ({
        objectType: item.objectType as SupportedObjectType,
        objectName: item.objectName,
        uri: item.uri,
        packageName: item.packageName,
      })),
    });

    return textResult(JSON.stringify(
      {
        ...result,
        results: result.results.map((item) => ({
          requestedOrder: item.requestedOrder,
          executionOrder: item.executionOrder,
          objectType: item.objectType,
          objectName: item.objectName,
          uri: item.uri,
          success: item.success,
          error: item.error,
          status: item.response?.status,
          statusText: item.response?.statusText,
          body: item.response ? trimBody(item.response.body) : undefined,
        })),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_get_activation_log",
  "Fetch the global ADT activation/inactive-objects log for the current user/session.",
  {},
  async () => {
    const response = await adtClient.getActivationLog();
    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_delete_object",
  "Delete an ABAP repository or DDIC object via SAP ADT using lockHandle and corrNr when required.",
  {
    objectType: z.enum([
      "class",
      "program",
      "ddls",
      "dcls",
      "ddlx",
      "package",
      "dataelement",
      "domain",
      "table",
      "structure",
      "tabletype",
    ]),
    objectName: z.string().optional(),
    uri: z.string().optional(),
    packageName: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ objectType, objectName, uri, packageName, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.deleteObject({
      objectType: objectType as DeletableObjectType,
      objectName,
      uri,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_transport_request",
  "Create a new CTS transport request via SAP ADT.",
  {
    description: z.string(),
    requestType: z.enum(["K", "W"]).optional(),
    owner: z.string().optional(),
    target: z.string().optional(),
    sourceClient: z.string().optional(),
  },
  async ({ description, requestType, owner, target, sourceClient }) => {
    const response = await adtClient.createTransportRequest({
      description,
      requestType: requestType ?? "K",
      owner,
      target,
      sourceClient,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_list_transport_requests",
  "List CTS transport requests visible to the configured user and return a parsed summary plus raw XML.",
  {
    requestStatus: z.enum(["D", "R"]).optional(),
    requestType: z.enum(["K", "W"]).optional(),
    owner: z.string().optional(),
  },
  async ({ requestStatus, requestType, owner }) => {
    const response = await adtClient.listTransportRequests({
      requestStatus,
      requestType,
      owner,
    });

    return textResult(JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        requests: parseTransportRequestList(response.body).map((request) => ({
          number: request["tm:number"] ?? "",
          owner: request["tm:owner"] ?? "",
          description: request["tm:desc"] ?? "",
          type: request["tm:type"] ?? "",
          status: request["tm:status"] ?? "",
          statusText: request["tm:status_text"] ?? "",
          target: request["tm:target"] ?? "",
          sourceClient: request["tm:source_client"] ?? "",
          uri: request["tm:uri"] ?? "",
        })),
        rawBody: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_get_transport_request",
  "Read one CTS transport request or task, returning parsed header, tasks, objects and raw XML.",
  {
    requestNumber: z.string(),
  },
  async ({ requestNumber }) => {
    const response = await adtClient.getTransportRequest({ requestNumber });
    const detail = parseTransportRequestDetail(response.body);

    return textResult(JSON.stringify(
      {
        status: response.status,
        statusText: response.statusText,
        request: detail.request ? {
          number: detail.request["tm:number"] ?? "",
          owner: detail.request["tm:owner"] ?? "",
          description: detail.request["tm:desc"] ?? "",
          type: detail.request["tm:type"] ?? "",
          status: detail.request["tm:status"] ?? "",
          statusText: detail.request["tm:status_text"] ?? "",
          target: detail.request["tm:target"] ?? "",
          sourceClient: detail.request["tm:source_client"] ?? "",
          uri: detail.request["tm:uri"] ?? "",
        } : undefined,
        tasks: detail.tasks.map((task) => ({
          number: task["tm:number"] ?? "",
          parent: task["tm:parent"] ?? "",
          owner: task["tm:owner"] ?? "",
          description: task["tm:desc"] ?? "",
          status: task["tm:status"] ?? "",
          statusText: task["tm:status_text"] ?? "",
          uri: task["tm:uri"] ?? "",
        })),
        objects: detail.objects.map((object) => ({
          pgmid: object["tm:pgmid"] ?? "",
          type: object["tm:type"] ?? "",
          name: object["tm:name"] ?? "",
          wbType: object["tm:wbtype"] ?? "",
          description: object["tm:obj_desc"] ?? "",
          info: object["tm:obj_info"] ?? "",
          lockStatus: object["tm:lock_status"] ?? "",
          position: object["tm:position"] ?? "",
        })),
        objectCount: detail.objects.length,
        taskCount: detail.tasks.length,
        rawBody: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_check_transport_request",
  "Run CTS consistency check for one request or task and return the raw checklist XML.",
  {
    requestNumber: z.string(),
  },
  async ({ requestNumber }) => {
    const response = await adtClient.checkTransportRequest({ requestNumber });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_release_transport_request",
  "Release a CTS request or task. Standard mode uses newreleasejobs; the other modes call SAP's ignore-locks, ignore-warnings or ignore-ATC actions.",
  {
    requestNumber: z.string(),
    mode: z.enum(["standard", "ignoreLocks", "ignoreWarnings", "ignoreAtc"]).optional(),
  },
  async ({ requestNumber, mode }) => {
    const response = await adtClient.releaseTransportRequest({
      requestNumber,
      mode,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_safe_release_transport_request",
  "Release a CTS request safely: release remaining tasks first, check inactive transport markers, run sort/compress, call newreleasejobs with request XML payload, then verify final request status.",
  {
    requestNumber: z.string(),
    releaseTasksFirst: z.boolean().optional(),
    failOnInactiveObjects: z.boolean().optional(),
  },
  async ({ requestNumber, releaseTasksFirst, failOnInactiveObjects }) => {
    const result = await adtClient.safeReleaseTransportRequest({
      requestNumber,
      releaseTasksFirst,
      failOnInactiveObjects,
    });

    const before = parseTransportRequestDetail(result.detailBefore.body);
    const after = result.detailAfter ? parseTransportRequestDetail(result.detailAfter.body) : undefined;

    return textResult(JSON.stringify(
      {
        requestNumber,
        before: before.request ? {
          number: before.request["tm:number"] ?? "",
          status: before.request["tm:status"] ?? "",
          statusText: before.request["tm:status_text"] ?? "",
        } : undefined,
        releasedTasks: result.releasedTasks.map((response) => ({
          status: response.status,
          statusText: response.statusText,
          body: trimBody(response.body, 2000),
        })),
        sortAndCompress: result.sortAndCompress ? {
          status: result.sortAndCompress.status,
          statusText: result.sortAndCompress.statusText,
          body: trimBody(result.sortAndCompress.body, 2000),
        } : undefined,
        requestRelease: result.requestRelease ? {
          status: result.requestRelease.status,
          statusText: result.requestRelease.statusText,
          body: trimBody(result.requestRelease.body, 3000),
        } : undefined,
        after: after?.request ? {
          number: after.request["tm:number"] ?? "",
          status: after.request["tm:status"] ?? "",
          statusText: after.request["tm:status_text"] ?? "",
        } : undefined,
        inactiveBody: trimBody(result.inactiveBefore.body, 3000),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_delete_transport_request",
  "Delete a CTS request or task. This only succeeds for objects SAP still considers modifiable and deletable.",
  {
    requestNumber: z.string(),
  },
  async ({ requestNumber }) => {
    const response = await adtClient.deleteTransportRequest({ requestNumber });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_apply_transport_policy",
  "List the owner's CTS requests, classify them into keep/release/delete/review using a conservative policy, and optionally execute safe delete or release actions.",
  {
    owner: z.string().optional(),
    maxRequests: z.number().int().positive().max(200).optional(),
    keepRequestNumbers: z.array(z.string()).optional(),
    mode: z.enum(["analyze", "applyDeletes", "applyReleases"]).optional(),
    includeReleased: z.boolean().optional(),
  },
  async ({ owner, maxRequests, keepRequestNumbers, mode, includeReleased }) => {
    const effectiveOwner = owner ?? config.username;
    const requestMap = new Map<string, Record<string, string>>();
    const requestOrder: string[] = [];

    for (const requestStatus of includeReleased === false ? ["D"] : ["D", "R"]) {
      const response = await adtClient.listTransportRequests({
        owner: effectiveOwner,
        requestStatus: requestStatus as "D" | "R",
      });
      for (const request of parseTransportRequestList(response.body)) {
        const requestNumber = request["tm:number"];
        if (!requestNumber || requestMap.has(requestNumber)) {
          continue;
        }
        requestMap.set(requestNumber, request);
        requestOrder.push(requestNumber);
      }
    }

    const sortedRequestNumbers = requestOrder
      .sort((left, right) => {
        const leftChanged = requestMap.get(left)?.["tm:lastchanged_timestamp"] ?? "";
        const rightChanged = requestMap.get(right)?.["tm:lastchanged_timestamp"] ?? "";
        return rightChanged.localeCompare(leftChanged);
      })
      .slice(0, maxRequests ?? 50);

    const keepSet = new Set((keepRequestNumbers ?? []).map((requestNumber) => requestNumber.trim().toUpperCase()));
    const results = [];
    const actionResults = [];

    for (const requestNumber of sortedRequestNumbers) {
      const detailResponse = await adtClient.getTransportRequest({ requestNumber });
      const detail = parseTransportRequestDetail(detailResponse.body);
      const classification = classifyTransportRequest(detail.request, detail.tasks, detail.objects, keepSet);

      const summary = {
        requestNumber,
        owner: detail.request?.["tm:owner"] ?? requestMap.get(requestNumber)?.["tm:owner"] ?? "",
        description: detail.request?.["tm:desc"] ?? requestMap.get(requestNumber)?.["tm:desc"] ?? "",
        status: detail.request?.["tm:status"] ?? requestMap.get(requestNumber)?.["tm:status"] ?? "",
        statusText: detail.request?.["tm:status_text"] ?? requestMap.get(requestNumber)?.["tm:status_text"] ?? "",
        taskCount: detail.tasks.length,
        objectCount: detail.objects.length,
        classification: classification.classification,
        reason: classification.reason,
      };
      results.push(summary);

      if (mode === "applyDeletes" && classification.classification === "delete") {
        const deleteResponse = await adtClient.deleteTransportRequest({ requestNumber });
        actionResults.push({
          requestNumber,
          action: "delete",
          status: deleteResponse.status,
          statusText: deleteResponse.statusText,
          body: trimBody(deleteResponse.body, 3000),
        });
      }

      if (mode === "applyReleases" && classification.classification === "release") {
        const releaseResponse = await adtClient.releaseTransportRequest({ requestNumber, mode: "standard" });
        const afterResponse = await adtClient.getTransportRequest({ requestNumber });
        const afterDetail = parseTransportRequestDetail(afterResponse.body);
        actionResults.push({
          requestNumber,
          action: "release",
          status: releaseResponse.status,
          statusText: releaseResponse.statusText,
          afterStatus: afterDetail.request?.["tm:status"] ?? "",
          afterStatusText: afterDetail.request?.["tm:status_text"] ?? "",
          body: trimBody(releaseResponse.body, 3000),
        });
      }
    }

    return textResult(JSON.stringify(
      {
        owner: effectiveOwner,
        mode: mode ?? "analyze",
        totalRequests: results.length,
        summary: {
          keep: results.filter((item) => item.classification === "keep").length,
          release: results.filter((item) => item.classification === "release").length,
          delete: results.filter((item) => item.classification === "delete").length,
          review: results.filter((item) => item.classification === "review").length,
        },
        requests: results,
        actions: actionResults,
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_package",
  "Create a package via SAP ADT. Useful for bootstrapping a reusable development area in a new system.",
  {
    packageName: z.string(),
    description: z.string(),
    packageType: z.enum(["development", "structure"]).default("development"),
    superPackage: z.string().optional(),
    recordChanges: z.boolean().optional(),
    softwareComponent: z.string().optional(),
    softwareComponentDescription: z.string().optional(),
  },
  async ({
    packageName,
    description,
    packageType,
    superPackage,
    recordChanges,
    softwareComponent,
    softwareComponentDescription,
  }) => {
    assertAllowedPackage(config, packageName);
    if (superPackage) {
      assertAllowedPackage(config, superPackage);
    }

    const response = await adtClient.createPackage({
      packageName,
      description,
      packageType,
      superPackage,
      recordChanges: recordChanges ?? true,
      softwareComponent: softwareComponent ?? config.defaultSoftwareComponent,
      softwareComponentDescription:
        softwareComponentDescription ?? config.defaultSoftwareComponentDescription,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_abap_scaffold",
  "Create a reusable demo bundle from templates: package optionally, plus program, class and DDLS wired together.",
  {
    packageName: z.string(),
    createPackage: z.boolean().optional(),
    packageDescription: z.string().optional(),
    programName: z.string(),
    className: z.string(),
    ddlName: z.string(),
    descriptionPrefix: z.string().optional(),
    sourceTableName: z.string().optional(),
    masterSystem: z.string().optional(),
    abapLanguageVersion: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({
    packageName,
    createPackage,
    packageDescription,
    programName,
    className,
    ddlName,
    descriptionPrefix,
    sourceTableName,
    masterSystem,
    abapLanguageVersion,
    transportRequest,
  }) => {
    assertAllowedPackage(config, packageName);

    const responses = await adtClient.createScaffold({
      packageName,
      createPackage,
      packageDescription,
      programName,
      className,
      ddlName,
      descriptionPrefix,
      sourceTableName: sourceTableName ?? "SFLIGHT",
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      abapLanguageVersion: abapLanguageVersion ?? config.defaultAbapLanguageVersion,
      transportRequest,
    });

    return textResult(JSON.stringify(
      responses.map((response, index) => ({
        step: index + 1,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: trimBody(response.body),
      })),
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_program",
  "Create an executable ABAP report program via SAP ADT.",
  {
    programName: z.string(),
    description: z.string(),
    packageName: z.string(),
    masterSystem: z.string().optional(),
    abapLanguageVersion: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ programName, description, packageName, masterSystem, abapLanguageVersion, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createProgram({
      programName,
      description,
      packageName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      abapLanguageVersion: abapLanguageVersion ?? config.defaultAbapLanguageVersion,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_class",
  "Create an ABAP class shell via SAP ADT.",
  {
    className: z.string(),
    description: z.string(),
    packageName: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ className, description, packageName, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createClass({
      className,
      description,
      packageName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_ddls",
  "Create a CDS DDLS shell via SAP ADT.",
  {
    ddlName: z.string(),
    description: z.string(),
    packageName: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ ddlName, description, packageName, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createDdls({
      ddlName,
      description,
      packageName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_dcls",
  "Create a CDS DCL shell via SAP ADT.",
  {
    dclName: z.string(),
    description: z.string(),
    packageName: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ dclName, description, packageName, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createDcls({
      dclName,
      description,
      packageName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_ddlx",
  "Create a CDS metadata extension shell via SAP ADT.",
  {
    ddlxName: z.string(),
    description: z.string(),
    packageName: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ ddlxName, description, packageName, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createDdlx({
      ddlxName,
      description,
      packageName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_dataelement",
  "Create and activate a DDIC data element via SAP ADT metadata endpoints.",
  {
    dataElementName: z.string(),
    description: z.string(),
    packageName: z.string(),
    domainName: z.string(),
    shortFieldLabel: z.string(),
    mediumFieldLabel: z.string(),
    longFieldLabel: z.string(),
    headingFieldLabel: z.string(),
    defaultComponentName: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({
    dataElementName,
    description,
    packageName,
    domainName,
    shortFieldLabel,
    mediumFieldLabel,
    longFieldLabel,
    headingFieldLabel,
    defaultComponentName,
    masterSystem,
    transportRequest,
  }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createDataElement({
      dataElementName,
      description,
      packageName,
      domainName,
      shortFieldLabel,
      mediumFieldLabel,
      longFieldLabel,
      headingFieldLabel,
      defaultComponentName,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_domain",
  "Create and activate a DDIC domain via SAP ADT metadata endpoints.",
  {
    domainName: z.string(),
    description: z.string(),
    packageName: z.string(),
    dataType: z.string(),
    length: z.string(),
    decimals: z.string().optional(),
    outputLength: z.string().optional(),
    lowercase: z.boolean().optional(),
    valueTableName: z.string().optional(),
    fixedValues: z.array(z.object({
      low: z.string().optional(),
      high: z.string().optional(),
      text: z.string(),
      position: z.string().optional(),
    })).optional(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({
    domainName,
    description,
    packageName,
    dataType,
    length,
    decimals,
    outputLength,
    lowercase,
    valueTableName,
    fixedValues,
    masterSystem,
    transportRequest,
  }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createDomain({
      domainName,
      description,
      packageName,
      dataType,
      length,
      decimals,
      outputLength,
      lowercase,
      valueTableName,
      fixedValues,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_table",
  "Create and activate a DDIC transparent table via ADT. The source must be a full DEFINE TABLE source.",
  {
    tableName: z.string(),
    description: z.string(),
    packageName: z.string(),
    source: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ tableName, description, packageName, source, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createTable({
      tableName,
      description,
      packageName,
      source,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_structure",
  "Create and activate a DDIC structure via ADT. The source must be a full DEFINE STRUCTURE source.",
  {
    structureName: z.string(),
    description: z.string(),
    packageName: z.string(),
    source: z.string(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ structureName, description, packageName, source, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createStructure({
      structureName,
      description,
      packageName,
      source,
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

server.tool(
  "sap_adt_create_tabletype",
  "Create and activate a DDIC table type via SAP ADT metadata endpoints.",
  {
    tableTypeName: z.string(),
    description: z.string(),
    packageName: z.string(),
    rowTypeName: z.string(),
    accessType: z.enum(["standard", "sorted", "hashed", "index"]).optional(),
    masterSystem: z.string().optional(),
    transportRequest: z.string().optional(),
  },
  async ({ tableTypeName, description, packageName, rowTypeName, accessType, masterSystem, transportRequest }) => {
    assertAllowedPackage(config, packageName);

    const response = await adtClient.createTableType({
      tableTypeName,
      description,
      packageName,
      rowTypeName,
      accessType: accessType ?? "standard",
      masterSystem: masterSystem ?? config.defaultMasterSystem,
      transportRequest,
    });

    return textResult(JSON.stringify(
      {
        ...response,
        body: trimBody(response.body),
      },
      null,
      2,
    ));
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("sap-adt-mcp failed to start", error);
  process.exit(1);
});
