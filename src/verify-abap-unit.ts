import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AdtClient } from "./adt-client.js";
import { loadConfig } from "./config.js";
import { parseAbapUnitResult, trimBody } from "./utils.js";

function readOption(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const objectType = (readOption("--objectType") ?? "class") as "class" | "program";
  const objectName = readOption("--objectName") ?? "CL_ABAP_CHAR_UTILITIES";
  const config = loadConfig();
  const client = new AdtClient(config);

  const metadata = await client.getAbapUnitMetadata();
  const liveResult = await client.runAbapUnit({
    objectType,
    objectName,
    withNavigationUri: true,
  });

  const samplePath = resolve(process.cwd(), "references/abapunit-junit-sample.xml");
  const sampleXml = readFileSync(samplePath, "utf-8");

  console.log(JSON.stringify(
    {
      referenceObject: {
        objectType,
        objectName,
      },
      metadata: {
        status: metadata.status,
        statusText: metadata.statusText,
        body: trimBody(metadata.body, 2000),
      },
      liveResult: {
        status: liveResult.status,
        statusText: liveResult.statusText,
        parsedResult: parseAbapUnitResult(liveResult.body),
        body: trimBody(liveResult.body, 4000),
      },
      parserReferenceSample: {
        source: samplePath,
        parsedResult: parseAbapUnitResult(sampleXml),
      },
    },
    null,
    2,
  ));
}

await main();
