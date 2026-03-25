# SAP ADT MCP – E2E-test 2026-03-25

## Syfte

Verifiera ett helt utvecklingsspår via MCP och ADT:

1. skapa transportrequest
2. skapa paket
3. skapa flera CDS-objekt inklusive consumption view
4. skapa metadata extension och access control
5. skapa table function + AMDP-klass
6. skapa serviceklass som använder CDS-vyerna
7. skapa och köra ett program som använder klassen

## Plan

- använda en ny workbench-request skapad via ADT
- skapa ett nytt testpaket
- bygga ett litet flight-scenario på `SFLIGHT`
- använda table function för att beräkna `price_band`
- exponera resultatet via composite + consumption view
- lägga på DCL och DDLX
- läsa från consumption view i en ABAP-klass
- köra ett program som skriver ut rader

## Genomförande

Skapad request:
- `A4HK900287`

Skapat paket:
- `Z_MCP_E2E_287`

Skapade objekt:
- basic view: `ZI_MCP_E2E_FLB287`
- table function: `ZI_MCP_E2E_TF287`
- AMDP-klass: `ZCL_MCP_E2E_TF287`
- composite view: `ZI_MCP_E2E_FLC287`
- consumption view: `ZC_MCP_E2E_FL287`
- DCL: `ZC_MCP_E2E_FL287`
- DDLX: `ZC_MCP_E2E_FL287`
- serviceklass: `ZCL_MCP_E2E_SVC287`
- program: `Z_MCP_E2E_RUN287`

Verifierad runtime:

```text
AA  0017 09.10.2025              422,94  USD   LOW
AA  0017 10.11.2025              422,94  USD   LOW
AA  0017 12.12.2025              422,94  USD   LOW
AA  0017 13.01.2026              422,94  USD   LOW
AA  0017 14.02.2026              422,94  USD   LOW
```

## Utvärdering

Det som fungerade:
- transportrequest kunde skapas direkt via ADT
- paket kunde skapas och användas för hela objektkedjan
- DDLS, DCL och DDLX kunde skapas och skrivas via ADT
- table function + AMDP-klass fungerade enligt tidigare verifierad aktiveringsordning
- serviceklass kunde läsa consumption view
- programkörning via `programrun` verifierade slutresultatet

Det som behövde rättas under testet:
- `createDdls` autoaktiverade först tomma shell-objekt, vilket gav inactive-artefakter
- samma princip gäller för `createDcls` och `createDdlx`
- DDLX-objekttypen verifierades som `DDLX/EX`, inte den tidigare gissade typen

## Nya verifierade fynd

- transportrequest-create fungerar via `POST /sap/bc/adt/cts/transportrequests`
- create-payload för transportrequest måste ha root `tm:root`
- DCL create-namespace är `http://www.sap.com/adt/acm/dclsources`
- DDLX create-namespace är `http://www.sap.com/adt/ddic/ddlxsources`
- DCL-typ är `DCLS/DL`
- DDLX-typ är `DDLX/EX`
- DDLS-, DCL- och DDLX-shells ska inte autoaktiveras direkt efter create

## Kvarvarande notering

- `createPackage(...)` använder fortfarande inte explicit `corrNr`
- i denna verifiering blockerade det inte scenariot, men exakt request-bindning för paketcreate är ännu inte hårdverifierad på samma nivå som övriga objekt
