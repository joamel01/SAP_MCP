import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import type { ObjectUriTemplateMap, ServerConfig, SupportedObjectType } from "./types.js";

dotenv.config();

const SUPPORTED_TYPES: SupportedObjectType[] = ["class", "program", "ddls", "dcls", "ddlx"];

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function loadUriTemplates(): ObjectUriTemplateMap {
  const templateFile = process.env.SAP_ADT_URI_TEMPLATES_FILE ?? "./config/object-uri-templates.json";
  const absolutePath = resolve(process.cwd(), templateFile);
  const raw = readFileSync(absolutePath, "utf-8");
  return JSON.parse(raw) as ObjectUriTemplateMap;
}

function loadAllowedObjectTypes(): SupportedObjectType[] {
  const configured = parseList(process.env.SAP_ADT_ALLOWED_OBJECT_TYPES);
  if (configured.length === 0) {
    return SUPPORTED_TYPES;
  }

  const invalid = configured.filter(
    (item) => !SUPPORTED_TYPES.includes(item as SupportedObjectType),
  );
  if (invalid.length > 0) {
    throw new Error(`Unsupported object types in SAP_ADT_ALLOWED_OBJECT_TYPES: ${invalid.join(", ")}`);
  }

  return configured as SupportedObjectType[];
}

export function loadConfig(): ServerConfig {
  return {
    adtBaseUrl: readRequiredEnv("SAP_ADT_BASE_URL").replace(/\/$/, ""),
    username: readRequiredEnv("SAP_ADT_USERNAME"),
    password: readRequiredEnv("SAP_ADT_PASSWORD"),
    timeoutMs: Number(process.env.SAP_ADT_TIMEOUT_MS ?? "30000"),
    verifyTls: parseBoolean(process.env.SAP_ADT_VERIFY_TLS, true),
    defaultTransportRequest: process.env.SAP_ADT_DEFAULT_TRANSPORT_REQUEST,
    allowedPackages: parseList(process.env.SAP_ADT_ALLOWED_PACKAGES),
    allowedObjectTypes: loadAllowedObjectTypes(),
    uriTemplates: loadUriTemplates(),
    defaultMasterSystem: process.env.SAP_ADT_DEFAULT_MASTER_SYSTEM ?? "A4H",
    defaultAbapLanguageVersion: process.env.SAP_ADT_DEFAULT_ABAP_LANGUAGE_VERSION ?? "standard",
    defaultSoftwareComponent: process.env.SAP_ADT_DEFAULT_SOFTWARE_COMPONENT ?? "HOME",
    defaultSoftwareComponentDescription:
      process.env.SAP_ADT_DEFAULT_SOFTWARE_COMPONENT_DESCRIPTION ?? "Customer Developments",
  };
}
