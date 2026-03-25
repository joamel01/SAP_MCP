# SAP ADT MCP – Risker och säkerhet

## Huvudrisker

### 1. För bred skrivbehörighet

Om MCP-servern får skriva fritt i repositoryt blir riskytan onödigt stor.

Motåtgärd:

- allowlist på package-nivå
- allowlist på objekttyp
- eget tekniskt konto för utveckling

### 2. Bristande spårbarhet

Om servern gör ändringar utan tydlig logg blir det svårt att granska i efterhand.

Motåtgärd:

- logga varje `write`
- logga varje `activate`
- inkludera tid, objekt och användare/systemidentitet

### 3. Lås- och transportkonflikter

ADT-skrivning kan kollidera med vanlig utveckling i ADT.

Motåtgärd:

- börja i ren utvecklingsmiljö
- skriv bara i ett avgränsat package
- avstå initialt från transportautomation

### 4. Versions- och releasevariation

Alla ADT-endpoints beter sig inte exakt lika mellan releaser.

Motåtgärd:

- börja med de enklaste objekttyperna
- använd ADT communication log som referens
- bygg felhantering som visar råa svar vid behov

## Rekommenderad säkerhetsmodell

### Konto

- separat tekniskt användarkonto
- minsta möjliga behörighet

### Nät

- intern åtkomst
- HTTPS
- gärna IP- eller nätsegmentsbegränsning

### Funktionsbegränsning

Tillåt först bara:

- read
- write
- activate
- activation log

Tillåt inte:

- transportfrisläppning
- repository-rensning
- massändringar

## Go / No-Go

### Go

Om ni kan acceptera:

- en liten intern integrationskomponent
- ett tekniskt konto
- avgränsade packages

### No-Go

Om ni kräver:

- full produktionsnära transporthantering direkt
- bred repository-skrivning utan begränsning
- noll säkerhetsgranskning

## Slutsats

Lösningen är genomförbar, men bör införas som ett kontrollerat utvecklingsverktyg, inte som en generell SAP-admin-kanal.
