import { AdtClient } from "../src/adt-client.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const client = new AdtClient(config);

const programName = process.argv[2] ?? "Z_MCP_SHLP_INSPECT";
const searchHelpName = process.argv[3] ?? "ZMCP_HELP_TEST";
const packageName = process.argv[4] ?? "Z_DEV_KODEXPORT";

const source = `REPORT ${programName.toLowerCase()}.

DATA: ls_dd30v TYPE dd30v,
      lt_dd31v TYPE STANDARD TABLE OF dd31v,
      lt_dd32p TYPE STANDARD TABLE OF dd32p,
      lt_dd33v TYPE STANDARD TABLE OF dd33v,
      lv_state TYPE ddgotstate.

DATA lo_dd30v_desc TYPE REF TO cl_abap_structdescr.
DATA lo_dd32p_desc TYPE REF TO cl_abap_structdescr.

CALL FUNCTION 'DDIF_SHLP_GET'
  EXPORTING
    name      = '${searchHelpName}'
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

IF sy-subrc <> 0.
  WRITE: / 'DDIF_SHLP_GET failed:', sy-subrc.
  RETURN.
ENDIF.

lo_dd30v_desc ?= cl_abap_typedescr=>describe_by_data( ls_dd30v ).
lo_dd32p_desc ?= cl_abap_typedescr=>describe_by_data( VALUE dd32p( ) ).

WRITE: / 'STATE', lv_state.
WRITE: / 'SHLPNAME', ls_dd30v-shlpname.
WRITE: / 'SELMTYPE', ls_dd30v-selmtype.
WRITE: / 'SELMETHOD', ls_dd30v-selmethod.
WRITE: / 'DIALOGTYPE', ls_dd30v-dialogtype.
WRITE: / 'HOTKEY', ls_dd30v-hotkey.
WRITE: / 'PARAMS', lines( lt_dd32p ).

WRITE: / 'DD30V COMPONENTS'.
LOOP AT lo_dd30v_desc->components ASSIGNING FIELD-SYMBOL(<ls_dd30v_comp>).
  WRITE: / <ls_dd30v_comp>-name.
ENDLOOP.

WRITE: / 'DD32P COMPONENTS'.
LOOP AT lo_dd32p_desc->components ASSIGNING FIELD-SYMBOL(<ls_dd32p_comp>).
  WRITE: / <ls_dd32p_comp>-name.
ENDLOOP.

LOOP AT lt_dd32p ASSIGNING FIELD-SYMBOL(<ls_dd32p>).
  WRITE: / 'PARAM', <ls_dd32p>-shlpselpos, <ls_dd32p>-fieldname,
           <ls_dd32p>-shlplispos, <ls_dd32p>-shlpoutput.
ENDLOOP.
`;

async function main() {
  try {
    const createResponse = await client.createProgram({
      programName,
      description: "MCP search help probe",
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
