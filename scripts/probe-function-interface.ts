import { AdtClient } from "../src/adt-client.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const client = new AdtClient(config);

const functionName = (process.argv[2] ?? "DDIF_SHLP_PUT").toUpperCase();
const programName = (process.argv[3] ?? "Z_MCP_FM_INTF").toUpperCase();
const packageName = process.argv[4] ?? "Z_DEV_KODEXPORT";

const source = `REPORT ${programName.toLowerCase()}.

PARAMETERS p_fm TYPE rs38l_fnam DEFAULT '${functionName}'.

SELECT *
  FROM fupararef
  WHERE funcname = @p_fm
  ORDER BY PRIMARY KEY
  INTO TABLE @DATA(lt_params).

DATA lo_desc TYPE REF TO cl_abap_structdescr.
lo_desc ?= cl_abap_typedescr=>describe_by_data( VALUE fupararef( ) ).

WRITE: / 'FUNCNAME', p_fm.

WRITE: / 'COMPONENTS'.
LOOP AT lo_desc->components ASSIGNING FIELD-SYMBOL(<ls_comp>).
  WRITE: / <ls_comp>-name.
ENDLOOP.

LOOP AT lt_params ASSIGNING FIELD-SYMBOL(<ls_param>).
  WRITE: / sy-tabix.
  ASSIGN COMPONENT 1 OF STRUCTURE <ls_param> TO FIELD-SYMBOL(<lv_1>).
  ASSIGN COMPONENT 2 OF STRUCTURE <ls_param> TO FIELD-SYMBOL(<lv_2>).
  ASSIGN COMPONENT 3 OF STRUCTURE <ls_param> TO FIELD-SYMBOL(<lv_3>).
  ASSIGN COMPONENT 4 OF STRUCTURE <ls_param> TO FIELD-SYMBOL(<lv_4>).
  ASSIGN COMPONENT 5 OF STRUCTURE <ls_param> TO FIELD-SYMBOL(<lv_5>).
  IF <lv_1> IS ASSIGNED. WRITE <lv_1>. ENDIF.
  IF <lv_2> IS ASSIGNED. WRITE <lv_2>. ENDIF.
  IF <lv_3> IS ASSIGNED. WRITE <lv_3>. ENDIF.
  IF <lv_4> IS ASSIGNED. WRITE <lv_4>. ENDIF.
  IF <lv_5> IS ASSIGNED. WRITE <lv_5>. ENDIF.
ENDLOOP.
`;

async function main() {
  try {
    const createResponse = await client.createProgram({
      programName,
      description: "MCP FM interface probe",
      packageName,
      masterSystem: config.defaultMasterSystem,
      abapLanguageVersion: config.defaultAbapLanguageVersion,
    });
    console.log("CREATE", createResponse.status, createResponse.statusText);
  } catch (error) {
    const text = String(error);
    if (!text.includes("already exists")) {
      throw error;
    }
    console.log("CREATE", "exists");
  }

  const writeResponse = await client.writeObject({
    objectType: "program",
    objectName: programName,
    content: source,
    activateAfterWrite: false,
  });
  console.log("WRITE", writeResponse.status, writeResponse.statusText);

  const activateResponse = await client.activateObject({
    uri: `/sap/bc/adt/programs/programs/${programName.toLowerCase()}`,
    name: programName,
  });
  console.log("ACTIVATE", activateResponse.status, activateResponse.statusText);
  if (activateResponse.body) {
    console.log(activateResponse.body);
  }

  const result = await client.runProgram({ programName });
  console.log("RUN", result.status, result.statusText);
  console.log(result.body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
