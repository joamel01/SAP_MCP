import { loadConfig } from "./config.js";
import { AdtClient } from "./adt-client.js";
import { parseAbapUnitResult, trimBody } from "./utils.js";

const client = new AdtClient(loadConfig());
const args = new Map(
  process.argv.slice(2).flatMap((item) => {
    const match = item.match(/^--([^=]+)=(.*)$/);
    return match ? [[match[1], match[2]]] : [];
  }),
);
const transportRequest = args.get("transportRequest") ?? process.env.SAP_ADT_VERIFY_TRANSPORT_REQUEST;
const packageName = args.get("packageName") ?? process.env.SAP_ADT_VERIFY_PACKAGE ?? "Z_DEV_KODEXPORT";
const className = args.get("className") ?? "ZCL_MCP_AUNIT_LV1";
const programName = args.get("programName") ?? "Z_MCP_AUNIT_LV1";

const classSource = `CLASS zcl_mcp_aunit_lv1 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS add
      IMPORTING iv_left  TYPE i
                iv_right TYPE i
      RETURNING VALUE(rv_result) TYPE i.
ENDCLASS.

CLASS zcl_mcp_aunit_lv1 IMPLEMENTATION.
  METHOD add.
    rv_result = iv_left + iv_right.
  ENDMETHOD.
ENDCLASS.

CLASS ltc_addition DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS adds_two_numbers FOR TESTING.
ENDCLASS.

CLASS ltc_addition IMPLEMENTATION.
  METHOD adds_two_numbers.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_mcp_aunit_lv1=>add( iv_left = 2 iv_right = 3 )
      exp = 5 ).
  ENDMETHOD.
ENDCLASS.
`;

const programSource = `REPORT z_mcp_aunit_lv1.

CLASS ltc_report DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS basic_assertion FOR TESTING.
ENDCLASS.

CLASS ltc_report IMPLEMENTATION.
  METHOD basic_assertion.
    cl_abap_unit_assert=>assert_equals( act = 2 + 2 exp = 4 ).
  ENDMETHOD.
ENDCLASS.
`;

async function ensureCreate() {
  if (!transportRequest) {
    throw new Error(
      "A transport request is required for live ABAP Unit verification. Supply --transportRequest=... or set SAP_ADT_VERIFY_TRANSPORT_REQUEST.",
    );
  }

  for (const action of [
    async () => client.createClass({
      className,
      description: "MCP ABAP Unit live verification",
      packageName,
      masterSystem: "A4H",
      transportRequest,
    }),
    async () => client.createProgram({
      programName,
      description: "MCP ABAP Unit live verification",
      packageName,
      masterSystem: "A4H",
      abapLanguageVersion: "standard",
      transportRequest,
    }),
  ]) {
    try {
      await action();
    } catch (error) {
      if (!String(error).includes("already_exists")) {
        throw error;
      }
    }
  }

  await client.writeObject({
    objectType: "class",
    objectName: className,
    content: classSource,
    transportRequest,
    activateAfterWrite: true,
  });

  await client.writeObject({
    objectType: "program",
    objectName: programName,
    content: programSource,
    transportRequest,
    activateAfterWrite: true,
  });
}

async function main() {
  await ensureCreate();

  const metadata = await client.getAbapUnitMetadata();
  const matrix = [
    { label: "class-default", input: { objectType: "class" as const, objectName: className } },
    {
      label: "class-assigned",
      input: { objectType: "class" as const, objectName: className, assignedTests: true, sameProgram: false },
    },
    {
      label: "class-nav",
      input: { objectType: "class" as const, objectName: className, withNavigationUri: true },
    },
    { label: "program-default", input: { objectType: "program" as const, objectName: programName } },
    {
      label: "program-assigned",
      input: { objectType: "program" as const, objectName: programName, assignedTests: true, sameProgram: true },
    },
    {
      label: "program-nav",
      input: { objectType: "program" as const, objectName: programName, withNavigationUri: true },
    },
  ];

  const results = [];
  for (const item of matrix) {
    const response = await client.runAbapUnit(item.input);
    results.push({
      label: item.label,
      status: response.status,
      statusText: response.statusText,
      parsedResult: parseAbapUnitResult(response.body),
      body: trimBody(response.body, 2000),
    });
  }

  console.log(JSON.stringify({
    metadata: {
      status: metadata.status,
      statusText: metadata.statusText,
      body: trimBody(metadata.body, 2000),
    },
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
