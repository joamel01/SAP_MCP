# SAP ADT MCP – Transportrekommendation 2026-03-25

## Behåll

De här requestarna bör behållas tills vidare som referens eller verifierad leveranspunkt:

- `A4HK900287`
  - full E2E-request för MCP-testet
  - innehåller CDS, DCL, DDLX, AMDP, klass och program
- `A4HK900282`
  - released referensrequest för samma E2E-spår
- `A4HK900291`
  - released teknisk verifiering för release/delete av tom request

## Behåll tills du bestämt om de ska sparas

- `A4HK900283`
  - delvis E2E-spår
  - bara två `DDLS`-objekt för `ZI_MCP_E2E_FLB283`
- `A4HK900288`
  - bara `DEVC` för `Z_MCP_E2E_287`
- `A4HK900284`
  - bara `DEVC` för `Z_MCP_E2E_283`

## Rensa först

Första rimliga städomgången är äldre `Generated Request for Change Recording` som bara innehåller ett enstaka testobjekt eller ett litet par dubblettposter.

Bra första kandidater:

- `A4HK900126`
  - äldre scaffoldtest
  - objekt:
    - `ZCL_MCP_SCAFF_SVC4`
    - `ZI_MCP_SCAFF_FLT5`
    - `Z_MCP_FILL_SIMPLE_TAB`
    - `Z_MCP_SCAFF_RUN4`
- `A4HK900128`
  - `ZCL_MCP_CLASSRUN_DEMO`
- `A4HK900130`
  - `Z_MCP_SCAFF_RUN2`
- `A4HK900132`
  - `ZCL_MCP_SCAFF_SVC2`
- `A4HK900134`
  - `Z_MCP_TMP_TRANSP`
- `A4HK900136`
  - `Z_MCP_DELETE_TMP4`
- `A4HK900138`
  - `Z_MCP_DELETE_TMP5`
- `A4HK900140`
  - sökhjälpstest
- `A4HK900142` till `A4HK900188`
  - huvudsakligen sökhjälps- och funktionsgränssnittstest
- `A4HK900190` till `A4HK900230`
  - delete-, package- och FM-testspår
- `A4HK900232`
  - paket `Z_MCP_TPK249520`
- `A4HK900234`
  - program `Z_MCP_TPRG49520`
- `A4HK900236` till `A4HK900278`
  - aktiverings-, create-, fix- och klass-/programtester

## Gå igenom separat

- `A4HK900280`
  - större felsökningsrequest
  - innehåller flera klass- och programobjekt som användes när aktiverings- och transportproblemen stabiliserades
  - denna bör läsas igenom och eventuellt delas upp innan du beslutar om rensning

## Praktisk strategi

1. Behåll `A4HK900287`, `A4HK900282`, `A4HK900291`.
2. Bestäm om `A4HK900283`, `A4HK900288`, `A4HK900284` ska sparas eller städas.
3. Rensa sedan äldre `Generated Request for Change Recording` i stigande ordning.
4. Ta `A4HK900280` sist, eftersom den är mest blandad.
