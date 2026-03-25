import { AdtClient } from "../src/adt-client.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const client = new AdtClient(config);

const helperProgram = (process.argv[2] ?? "Z_MCP_CREATE_SHLP").toUpperCase();
const searchHelpName = (process.argv[3] ?? "ZMCP_SCARR_HELP").toUpperCase();
const packageName = (process.argv[4] ?? "Z_DEV_KODEXPORT").toUpperCase();
const transportRequest = (process.argv[5] ?? "").toUpperCase();

const source = `REPORT ${helperProgram.toLowerCase()}.

CONSTANTS:
  lc_shlp    TYPE ddobjname VALUE '${searchHelpName}',
  lc_package TYPE tadir-devclass VALUE '${packageName}',
  lc_table   TYPE ddobjname VALUE 'SCARR',
  lc_korr    TYPE e070-trkorr VALUE '${transportRequest}'.

DATA:
  ls_dd30v  TYPE dd30v,
  lt_dd31v  TYPE STANDARD TABLE OF dd31v,
  lt_dd32p  TYPE STANDARD TABLE OF dd32p,
  lt_dd33v  TYPE STANDARD TABLE OF dd33v,
  lt_dd03p  TYPE STANDARD TABLE OF dd03p,
  ls_dd02v  TYPE dd02v,
  ls_dd09v  TYPE dd09v,
  lv_state  TYPE ddgotstate,
  lv_rc     TYPE sy-subrc,
  lv_korr   TYPE e070-trkorr,
  lv_order  TYPE e070-trkorr,
  lv_devclass TYPE tadir-devclass,
  lv_tadir_pgmid TYPE tadir-pgmid VALUE 'R3TR',
  lv_tadir_object TYPE tadir-object VALUE 'SHLP',
  lv_tadir_obj_name TYPE tadir-obj_name.

lv_tadir_obj_name = lc_shlp.

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

CALL FUNCTION 'RS_CORR_INSERT'
  EXPORTING
    object              = lc_shlp
    object_class        = 'DICT'
    mode                = 'I'
    devclass            = lc_package
    author              = sy-uname
    master_language     = sy-langu
    suppress_dialog     = 'X'
    global_lock         = 'X'
    korrnum             = lc_korr
    use_korrnum_immediatedly = 'X'
  IMPORTING
    korrnum             = lv_korr
    ordernum            = lv_order
  EXCEPTIONS
    cancelled           = 1
    permission_failure  = 2
    unknown_objectclass = 3
    OTHERS              = 4.

WRITE: / 'CORR_INSERT', sy-subrc, lv_korr, lv_order.

CLEAR ls_dd30v.
ls_dd30v-shlpname   = lc_shlp.
ls_dd30v-ddlanguage = sy-langu.
ls_dd30v-ddtext     = 'MCP SCARR search help'.
ls_dd30v-issimple   = 'X'.
ls_dd30v-selmethod  = lc_table.
ls_dd30v-selmtype   = 'T'.
ls_dd30v-dialogtype = 'D'.

LOOP AT lt_dd03p ASSIGNING FIELD-SYMBOL(<ls_dd03p>)
  WHERE fieldname = 'CARRID'.
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
  <ls_dd32p>-shlplispos = sy-tabix.
  IF <ls_dd03p>-fieldname = 'CARRID'.
    <ls_dd32p>-shlpinput  = 'X'.
    <ls_dd32p>-shlpoutput = 'X'.
    <ls_dd32p>-shlpselpos = 1.
  ENDIF.
ENDLOOP.

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

CALL FUNCTION 'TR_TADIR_INTERFACE'
  EXPORTING
    wi_tadir_pgmid      = lv_tadir_pgmid
    wi_tadir_object     = lv_tadir_object
    wi_tadir_obj_name   = lv_tadir_obj_name
    wi_tadir_devclass   = lc_package
    wi_tadir_masterlang = sy-langu
  EXCEPTIONS
    devclass_not_existing         = 1
    devclass_not_specified        = 2
    object_exists_global          = 3
    object_exists_local           = 4
    tadir_entry_ill_type          = 5
    object_reserved_for_devclass  = 6
    object_is_distributed         = 7
    order_missing                 = 8
    no_authorization_to_delete    = 9
    OTHERS                        = 10.

WRITE: / 'TADIR_IF', sy-subrc.

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

CLEAR: ls_dd30v, lt_dd31v, lt_dd32p, lt_dd33v.

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

CLEAR: ls_dd30v, lt_dd31v, lt_dd32p, lt_dd33v, lv_state.

CALL FUNCTION 'DDIF_SHLP_GET'
  EXPORTING
    name      = lc_shlp
    state     = 'M'
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

WRITE: / 'SHLP_GET_M', sy-subrc, lv_state, ls_dd30v-shlpname, ls_dd30v-selmethod.
WRITE: / 'SHLP_GET_M_PARAMS', lines( lt_dd32p ).

SELECT pgmid, object, devclass
  FROM tadir
  WHERE obj_name = @lc_shlp
  INTO TABLE @DATA(lt_tadir).

LOOP AT lt_tadir ASSIGNING FIELD-SYMBOL(<ls_tadir>).
  WRITE: / 'TADIR', <ls_tadir>-pgmid, <ls_tadir>-object, <ls_tadir>-devclass.
ENDLOOP.
`;

async function main() {
  try {
    await client.createProgram({
      programName: helperProgram,
      description: "MCP search help create probe",
      packageName,
      masterSystem: config.defaultMasterSystem,
      abapLanguageVersion: config.defaultAbapLanguageVersion,
    });
  } catch (error) {
    const text = String(error);
    if (!text.includes("already exists")) {
      throw error;
    }
  }

  const write = await client.writeObject({
    objectType: "program",
    objectName: helperProgram,
    content: source,
    activateAfterWrite: false,
  });
  console.log("WRITE", write.status, write.statusText);

  const activate = await client.activateObject({
    uri: `/sap/bc/adt/programs/programs/${helperProgram.toLowerCase()}`,
    name: helperProgram,
  });
  console.log("ACTIVATE", activate.status, activate.statusText);
  console.log(activate.body);

  const run = await client.runProgram({ programName: helperProgram });
  console.log("RUN", run.status, run.statusText);
  console.log(run.body);

  const read = await client.readSearchHelp({ searchHelpName });
  console.log("READ_SHLP", read.status, read.statusText);
  console.log(read.body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
