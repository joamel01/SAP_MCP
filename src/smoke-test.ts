import { AdtClient } from "./adt-client.js";
import { loadConfig } from "./config.js";
import { trimBody } from "./utils.js";

async function main() {
  const config = loadConfig();
  const client = new AdtClient(config);

  const checks = [
    {
      name: "discover",
      run: () => client.discoverSystem(),
    },
    {
      name: "class-source",
      run: () =>
        client.readObject({
          objectType: "class",
          objectName: "CL_ABAP_CHAR_UTILITIES",
        }),
    },
    {
      name: "program-source",
      run: () =>
        client.readObject({
          objectType: "program",
          objectName: "SAPMSSY0",
        }),
    },
    {
      name: "ddls-source",
      run: () =>
        client.readObject({
          objectType: "ddls",
          objectName: "I_CalendarDate",
        }),
    },
  ];

  for (const check of checks) {
    const result = await check.run();
    console.log(`\n=== ${check.name} ===`);
    console.log(`status: ${result.status} ${result.statusText}`);
    console.log(trimBody(result.body, 1200));
  }
}

main().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
