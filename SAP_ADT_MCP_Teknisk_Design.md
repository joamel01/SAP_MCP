# SAP ADT MCP – Teknisk design

## Målbild

Bygg en liten MCP-server som fungerar som ett kontrollerat mellanlager mellan en klient och SAP ADT.

Servern ska:

- ansluta till SAP-systemets ADT-endpoint via HTTP
- autentisera med tekniskt konto eller användaruppgifter
- översätta ett litet antal säkra MCP-anrop till ADT-anrop
- returnera repository-innehåll, aktiveringsstatus och fel på ett enkelt format

## Varför ADT och inte SAP GUI

ADT är rätt integrationsyta eftersom:

- ADT redan är ett maskinellt HTTP-baserat API
- repository-objekt kan läsas och uppdateras via ADT
- aktivering och syntaxkontroll i princip går att nå via ADT
- lösningen blir stabilare och säkrare än GUI-automation

## Föreslagen arkitektur

### Lager

1. MCP-server
2. ADT-klientlager
3. SAP ADT-endpoint

### MCP-server

Ansvar:

- exponera MCP-verktyg
- validera inparametrar
- logga säkra revisionshändelser
- blockera otillåtna objekt eller operationer

### ADT-klientlager

Ansvar:

- hantera HTTP-session
- CSRF-token om releasen kräver det
- headers och content types för ADT
- mappa objekt-URI:er
- tolka ADT-svar och fel

### SAP-endpoint

Förutsätter:

- ICF och ADT är aktiverat
- användaren har rätt ADT- och repositorybehörigheter
- HTTPS används

## Rekommenderad teknik

Det mest praktiska är Node.js eller TypeScript eftersom:

- det redan finns öppna ADT-klientbibliotek i Node-ekosystemet
- MCP-servrar ofta byggs där
- det är enkelt att kapsla HTTP och JSON-liknande returformat

Alternativ:

- Python fungerar också
- men Node är sannolikt snabbare väg till första användbara version

## Objektmodell i MCP

Följande operationer bör finnas i första versionen:

### 1. `discover_system`

Returnerar:

- system-id
- klient
- stöd för discovery
- stödda ADT-domäner i praktiken

### 2. `read_object`

Input:

- objekttyp
- objektnamn
- paket eller URI om känt

Returnerar:

- källa
- metadata
- objekt-URI
- ev. senaste aktiveringsstatus

### 3. `write_object`

Input:

- objekttyp
- objektnamn
- nytt innehåll
- ev. paket

Returnerar:

- skrivstatus
- objekt-URI
- om objektet uppdaterades eller skapades

### 4. `activate_object`

Input:

- objekt-URI eller objekttyp + namn

Returnerar:

- aktiveringsstatus
- feltext
- loggreferenser

### 5. `get_activation_log`

Input:

- objekt-URI
- eller ett aktiverings-id

Returnerar:

- syntaxfel
- rad/kolumn om tillgängligt
- beroendeobjekt som blockerar

## Objekt som bör stödjas först

1. klass
2. program
3. CDS DDLS
4. DCLS
5. DDLX

Skäl:

- de matchar era vanligaste projekt
- de räcker långt för AI-assisterad ABAP-utveckling

## Transport- och låsstrategi

Första versionen bör inte försöka lösa transporthantering fullt ut.

I stället:

- skriv bara i redan existerande utvecklingsobjekt
- eller skriv i en sandlåda/egen package
- returnera tydligt om objektet är låst

## Rekommenderad implementation i faser

### Fas 1

- discovery
- read object

### Fas 2

- write object
- activate object
- activation log

### Fas 3

- list package objects
- bulk read
- enklare dependency-insikt

### Fas 4

- transportstöd
- checks/run-resultat
- mer avancerad objektupplösning

## Acceptanskriterier för första version

1. kunna läsa en klass eller DDLS via namn
2. kunna skriva tillbaka ändrat källinnehåll
3. kunna aktivera objektet
4. kunna hämta tillbaka syntaxfel med begripligt felmeddelande
5. kunna begränsa vilka paket/objekttyper som får ändras

## Praktisk slutsats

Detta är genomförbart som ett mindre integrationsprojekt.

Den viktigaste designprincipen är:

- håll MCP-ytan smal
- håll behörigheter hårda
- börja med läs/skriv/aktivera

Det räcker långt för verklig nytta.
