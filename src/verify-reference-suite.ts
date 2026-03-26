import { AdtClient } from "./adt-client.js";
import { loadConfig } from "./config.js";
import { parseRuntimeOutput, trimBody } from "./utils.js";

interface ReferenceCheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  details: Record<string, unknown>;
}

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  const config = loadConfig();
  const client = new AdtClient(config);

  const referencePackage = env("SAP_ADT_REFERENCE_PACKAGE", "Z_DEV_KODEXPORT");
  const referenceProgram = env("SAP_ADT_REFERENCE_PROGRAM", "Z_FLIGHT_DEMO_REPORT");
  const referenceClass = env("SAP_ADT_REFERENCE_CLASS", "ZCL_MCP_CLASSRUN_DEMO");
  const referenceInterface = env("SAP_ADT_REFERENCE_INTERFACE");
  const referenceFunctionGroup = env("SAP_ADT_REFERENCE_FUNCTION_GROUP");
  const referenceFunctionModule = env("SAP_ADT_REFERENCE_FUNCTION_MODULE");

  const results: ReferenceCheckResult[] = [];

  const record = async (
    name: string,
    action: () => Promise<Record<string, unknown>>,
    enabled = true,
  ) => {
    if (!enabled) {
      results.push({
        name,
        status: "skipped",
        details: { reason: "not_configured" },
      });
      return;
    }

    try {
      const details = await action();
      results.push({
        name,
        status: "passed",
        details,
      });
    } catch (error) {
      results.push({
        name,
        status: "failed",
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  await record("discover", async () => {
    const response = await client.discoverSystem();
    return {
      status: response.status,
      statusText: response.statusText,
    };
  });

  await record("read_program", async () => {
    const response = await client.readObject({
      objectType: "program",
      objectName: referenceProgram,
    });
    return {
      objectName: referenceProgram,
      packageName: referencePackage,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: trimBody(response.body, 400),
    };
  }, referenceProgram !== "");

  await record("run_program", async () => {
    const response = await client.runProgram({
      programName: referenceProgram,
    });
    return {
      objectName: referenceProgram,
      status: response.status,
      statusText: response.statusText,
      parsedOutput: parseRuntimeOutput(response.body),
    };
  }, referenceProgram !== "");

  await record("read_class", async () => {
    const response = await client.readObject({
      objectType: "class",
      objectName: referenceClass,
    });
    return {
      objectName: referenceClass,
      packageName: referencePackage,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: trimBody(response.body, 400),
    };
  }, referenceClass !== "");

  await record("run_class", async () => {
    const response = await client.runClass({
      className: referenceClass,
    });
    return {
      objectName: referenceClass,
      status: response.status,
      statusText: response.statusText,
      parsedOutput: parseRuntimeOutput(response.body),
    };
  }, referenceClass !== "");

  await record("read_interface", async () => {
    const response = await client.readObject({
      objectType: "interface",
      objectName: referenceInterface,
    });
    return {
      objectName: referenceInterface,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: trimBody(response.body, 400),
    };
  }, referenceInterface !== "");

  await record("read_function_group", async () => {
    const response = await client.readObject({
      objectType: "functiongroup",
      objectName: referenceFunctionGroup,
    });
    return {
      objectName: referenceFunctionGroup,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: trimBody(response.body, 400),
    };
  }, referenceFunctionGroup !== "");

  await record("read_function_module", async () => {
    const response = await client.readObject({
      objectType: "functionmodule",
      objectName: referenceFunctionModule,
      containerName: referenceFunctionGroup,
    });
    return {
      objectName: referenceFunctionModule,
      containerName: referenceFunctionGroup,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: trimBody(response.body, 400),
    };
  }, referenceFunctionGroup !== "" && referenceFunctionModule !== "");

  const passedCount = results.filter((result) => result.status === "passed").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;

  console.log(JSON.stringify({
    packageName: referencePackage,
    passedCount,
    failedCount,
    skippedCount,
    results,
  }, null, 2));

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Reference suite verification failed", error);
  process.exit(1);
});
