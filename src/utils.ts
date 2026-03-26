export function applyTemplate(uriTemplate: string, variables: Record<string, string>): string {
  let result = uriTemplate;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  return result;
}

export function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export function normalizeObjectName(value: string): string {
  return value.trim().toUpperCase();
}

export function trimBody(body: string, maxLength = 12000): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}\n\n[truncated ${body.length - maxLength} chars]`;
}

export function parseXmlTag(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i"));
  return match?.[1];
}

export function parseXmlAttribute(xml: string, tagName: string, attributeName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*${attributeName}="([^"]*)"`, "i"));
  return match?.[1];
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function truncateObjectName(value: string, maxLength: number): string {
  return normalizeObjectName(value).slice(0, maxLength);
}

export function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function parseTagAttributes(attributeText: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
  let match = regex.exec(attributeText);
  while (match) {
    attributes[match[1]] = decodeXml(match[2]);
    match = regex.exec(attributeText);
  }
  return attributes;
}

export function parseTransportRequestList(xml: string): Array<Record<string, string>> {
  const requests: Array<Record<string, string>> = [];
  const regex = /<tm:request\b([^>]*)>/g;
  let match = regex.exec(xml);
  while (match) {
    requests.push(parseTagAttributes(match[1]));
    match = regex.exec(xml);
  }
  return requests;
}

export function parseTransportRequestDetail(xml: string): {
  request?: Record<string, string>;
  tasks: Array<Record<string, string>>;
  objects: Array<Record<string, string>>;
} {
  const requestMatch = xml.match(/<tm:request\b([^>]*)>/);
  const tasks: Array<Record<string, string>> = [];
  const objects: Array<Record<string, string>> = [];

  const taskRegex = /<tm:task\b([^>]*)>/g;
  let taskMatch = taskRegex.exec(xml);
  while (taskMatch) {
    tasks.push(parseTagAttributes(taskMatch[1]));
    taskMatch = taskRegex.exec(xml);
  }

  const objectRegex = /<tm:abap_object\b([^>]*)>/g;
  let objectMatch = objectRegex.exec(xml);
  while (objectMatch) {
    objects.push(parseTagAttributes(objectMatch[1]));
    objectMatch = objectRegex.exec(xml);
  }

  return {
    request: requestMatch ? parseTagAttributes(requestMatch[1]) : undefined,
    tasks,
    objects,
  };
}

export function parseInactiveTransportRequestNumbers(xml: string): string[] {
  const results = new Set<string>();
  const regex = /<ioc:ref\b([^>]*)\/>/g;
  let match = regex.exec(xml);
  while (match) {
    const attrs = parseTagAttributes(match[1]);
    const name = attrs["adtcore:name"];
    const uri = attrs["adtcore:uri"] ?? "";
    if (name && uri.includes("/cts/transportrequests/")) {
      results.add(name);
    }
    match = regex.exec(xml);
  }
  return [...results];
}

export interface ParsedAbapUnitFailure {
  kind: "failure" | "error" | "alert";
  className?: string;
  methodName?: string;
  message: string;
  type?: string;
  navigationUri?: string;
}

export interface ParsedAbapUnitMethod {
  className?: string;
  methodName: string;
  status?: string;
  durationSeconds?: string;
}

export interface ParsedAbapUnitClass {
  className: string;
  status?: string;
  methodCount?: number;
}

export interface ParsedAbapUnitResult {
  format: "empty" | "adt-aunit" | "junit" | "unknown";
  totalTests?: number;
  assertions?: number;
  failures?: number;
  errors?: number;
  skipped?: number;
  alerts?: number;
  testClassCount: number;
  testMethodCount: number;
  testClasses: ParsedAbapUnitClass[];
  testMethods: ParsedAbapUnitMethod[];
  failureMessages: ParsedAbapUnitFailure[];
}

export interface ParsedRuntimeOutput {
  format: "empty" | "plain_text" | "key_value_lines" | "tabular_text";
  lineCount: number;
  previewLines: string[];
  leadingLines?: string[];
  keyValues?: Record<string, string>;
  table?: {
    title?: string;
    headers: string[];
    rows: string[][];
  };
}

export interface ParsedUserParameterEntry {
  parameterId: string;
  value: string;
  text?: string;
}

export interface ParsedUserParameterHelperResult {
  mode?: string;
  userName?: string;
  result?: string;
  subrc?: number;
  count?: number;
  beforeCount?: number;
  afterCount?: number;
  parameters: ParsedUserParameterEntry[];
}

export interface LocalDocSearchResult {
  score: number;
  snippets: string[];
}

export function tokenizeSearchQuery(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9_/-]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  )];
}

export function searchLocalDocument(content: string, query: string, maxSnippets = 3): LocalDocSearchResult | undefined {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) {
    return undefined;
  }

  const lines = content.split(/\r?\n/);
  const normalizedLines = lines.map((line) => line.toLowerCase());

  let score = 0;
  const snippetMatches: string[] = [];

  normalizedLines.forEach((line, index) => {
    let lineScore = 0;
    for (const term of terms) {
      if (line.includes(term)) {
        lineScore += line.startsWith("#") ? 5 : 2;
      }
    }

    if (lineScore > 0) {
      score += lineScore;
      if (snippetMatches.length < maxSnippets) {
        const start = Math.max(0, index - 1);
        const end = Math.min(lines.length, index + 2);
        const snippet = lines
          .slice(start, end)
          .map((snippetLine) => snippetLine.trim())
          .filter((snippetLine) => snippetLine !== "")
          .join(" | ");
        if (snippet !== "" && !snippetMatches.includes(snippet)) {
          snippetMatches.push(snippet);
        }
      }
    }
  });

  if (score === 0) {
    return undefined;
  }

  return {
    score,
    snippets: snippetMatches,
  };
}

export function parseAbapUnitResult(xml: string): ParsedAbapUnitResult {
  const trimmed = xml.trim();

  if (
    trimmed === ""
    || (/^<\?xml[\s\S]*?<aunit:runResult\b/i.test(trimmed)
      && !/<testClass\b/i.test(trimmed)
      && !/<testMethod\b/i.test(trimmed)
      && !/<alert\b/i.test(trimmed)
      && !/<testsuites\b/i.test(trimmed))
  ) {
    return {
      format: "empty",
      testClassCount: 0,
      testMethodCount: 0,
      testClasses: [],
      testMethods: [],
      failureMessages: [],
    };
  }

  if (trimmed.includes("<testsuites")) {
    return parseJUnitAbapUnitResult(trimmed);
  }

  if (trimmed.includes("<aunit:runResult")) {
    return parseAdtAbapUnitResult(trimmed);
  }

  return {
    format: "unknown",
    testClassCount: 0,
    testMethodCount: 0,
    testClasses: [],
    testMethods: [],
    failureMessages: [],
  };
}

export function parseUserParameterHelperOutput(output: string): ParsedUserParameterHelperResult {
  const result: ParsedUserParameterHelperResult = {
    parameters: [],
  };

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("PARAM;")) {
      const attrs = parseSemicolonKeyValueLine(line.slice("PARAM;".length));
      const parameterId = attrs.PARID ?? "";
      if (!parameterId) {
        continue;
      }
      result.parameters.push({
        parameterId,
        value: attrs.PARVA ?? "",
        text: attrs.PARTEXT,
      });
      continue;
    }

    const attrs = parseSemicolonKeyValueLine(line);
    if (attrs.MODE) {
      result.mode = attrs.MODE;
    }
    if (attrs.USER) {
      result.userName = attrs.USER;
    }
    if (attrs.RESULT) {
      result.result = attrs.RESULT;
    }
    if (attrs.SUBRC && /^\d+$/.test(attrs.SUBRC)) {
      result.subrc = Number.parseInt(attrs.SUBRC, 10);
    }
    if (attrs.COUNT && /^\d+$/.test(attrs.COUNT)) {
      result.count = Number.parseInt(attrs.COUNT, 10);
    }
    if (attrs.BEFORE_COUNT && /^\d+$/.test(attrs.BEFORE_COUNT)) {
      result.beforeCount = Number.parseInt(attrs.BEFORE_COUNT, 10);
    }
    if (attrs.AFTER_COUNT && /^\d+$/.test(attrs.AFTER_COUNT)) {
      result.afterCount = Number.parseInt(attrs.AFTER_COUNT, 10);
    }
  }

  return result;
}

function parseSemicolonKeyValueLine(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of line.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim().toUpperCase();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function parseJUnitAbapUnitResult(xml: string): ParsedAbapUnitResult {
  const rootAttributes = parseRootTagAttributes(xml, "testsuites");
  const testClasses: ParsedAbapUnitClass[] = [];
  const testMethods: ParsedAbapUnitMethod[] = [];
  const failureMessages: ParsedAbapUnitFailure[] = [];

  const suiteRegex = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gi;
  let suiteMatch = suiteRegex.exec(xml);

  while (suiteMatch) {
    const suiteAttrs = parseTagAttributes(suiteMatch[1]);
    const className = suiteAttrs.name || suiteAttrs.package || "";
    const suiteBody = suiteMatch[2];
    testClasses.push({
      className: className || "(unnamed testsuite)",
      methodCount: Number.parseInt(suiteAttrs.tests ?? "0", 10) || undefined,
    });

    const caseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
    let caseMatch = caseRegex.exec(suiteBody);
    while (caseMatch) {
      const caseAttrs = parseTagAttributes(caseMatch[1]);
      const caseBody = caseMatch[2] ?? "";
      const methodName = caseAttrs.name ?? "(unnamed testcase)";

      let status = "passed";
      if (/<failure\b/i.test(caseBody)) {
        status = "failed";
      } else if (/<error\b/i.test(caseBody)) {
        status = "error";
      } else if (/<skipped\b/i.test(caseBody)) {
        status = "skipped";
      }

      testMethods.push({
        className: className || undefined,
        methodName,
        status,
        durationSeconds: caseAttrs.time,
      });

      const issueRegex = /<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let issueMatch = issueRegex.exec(caseBody);
      while (issueMatch) {
        const kind = issueMatch[1] as "failure" | "error";
        const issueAttrs = parseTagAttributes(issueMatch[2]);
        const rawMessage = issueAttrs.message ?? issueMatch[3] ?? "";
        failureMessages.push({
          kind,
          className: className || undefined,
          methodName,
          message: normalizeInlineXmlText(rawMessage),
          type: issueAttrs.type,
        });
        issueMatch = issueRegex.exec(caseBody);
      }

      caseMatch = caseRegex.exec(suiteBody);
    }

    suiteMatch = suiteRegex.exec(xml);
  }

  return {
    format: "junit",
    totalTests: toOptionalInt(rootAttributes.tests),
    assertions: toOptionalInt(rootAttributes.asserts),
    failures: toOptionalInt(rootAttributes.failures) ?? countByStatus(testMethods, "failed"),
    errors: toOptionalInt(rootAttributes.errors) ?? countByStatus(testMethods, "error"),
    skipped: toOptionalInt(rootAttributes.skipped) ?? countByStatus(testMethods, "skipped"),
    testClassCount: testClasses.length,
    testMethodCount: testMethods.length,
    testClasses,
    testMethods,
    failureMessages,
  };
}

function parseAdtAbapUnitResult(xml: string): ParsedAbapUnitResult {
  const testClasses: ParsedAbapUnitClass[] = [];
  const testMethods: ParsedAbapUnitMethod[] = [];
  const failureMessages: ParsedAbapUnitFailure[] = [];

  const classRegex = /<testClass\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testClass>)/gi;
  let classMatch = classRegex.exec(xml);
  while (classMatch) {
    const classAttrs = parseTagAttributes(classMatch[1]);
    const classBody = classMatch[2] ?? "";
    const className =
      classAttrs.name
      ?? classAttrs.className
      ?? classAttrs["adtcore:name"]
      ?? "(unnamed test class)";

    testClasses.push({
      className,
      status: classAttrs.status,
      methodCount: undefined,
    });

    const methodRegex = /<testMethod\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testMethod>)/gi;
    let methodMatch = methodRegex.exec(classBody);
    while (methodMatch) {
      const methodAttrs = parseTagAttributes(methodMatch[1]);
      const methodBody = methodMatch[2] ?? "";
      const methodName =
        methodAttrs.name
        ?? methodAttrs.methodName
        ?? methodAttrs["adtcore:name"]
        ?? "(unnamed test method)";
      const status = methodAttrs.status;
      testMethods.push({
        className,
        methodName,
        status,
        durationSeconds: methodAttrs.runtime ?? methodAttrs.time,
      });

      const alertRegex = /<alert\b([^>]*?)(?:\/>|>([\s\S]*?)<\/alert>)/gi;
      let alertMatch = alertRegex.exec(methodBody);
      while (alertMatch) {
        const alertAttrs = parseTagAttributes(alertMatch[1]);
        const alertBody = alertMatch[2] ?? "";
        const message =
          alertAttrs.message
          ?? parseXmlTag(alertBody, "message")
          ?? parseXmlTag(alertBody, "text")
          ?? normalizeInlineXmlText(alertBody)
          ?? "";
        failureMessages.push({
          kind: "alert",
          className,
          methodName,
          message,
          type: alertAttrs.severity ?? alertAttrs.type,
          navigationUri: alertAttrs.navigationUri ?? alertAttrs.uri ?? alertAttrs.href,
        });
        alertMatch = alertRegex.exec(methodBody);
      }

      methodMatch = methodRegex.exec(classBody);
    }

    classMatch = classRegex.exec(xml);
  }

  const alertCount = (xml.match(/<alert\b/gi) ?? []).length;
  const failures = failureMessages.filter((item) => item.kind === "alert").length;

  return {
    format: "adt-aunit",
    alerts: alertCount,
    failures,
    testClassCount: testClasses.length,
    testMethodCount: testMethods.length,
    testClasses,
    testMethods,
    failureMessages,
  };
}

function parseRootTagAttributes(xml: string, tagName: string): Record<string, string> {
  const regex = new RegExp(`<${tagName}\\b([^>]*)>`, "i");
  const match = xml.match(regex);
  return match ? parseTagAttributes(match[1]) : {};
}

function toOptionalInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function countByStatus(methods: ParsedAbapUnitMethod[], status: string): number {
  return methods.filter((method) => method.status === status).length;
}

function normalizeInlineXmlText(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseRuntimeOutput(body: string): ParsedRuntimeOutput {
  const normalized = normalizeRuntimeBody(body);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      format: "empty",
      lineCount: 0,
      previewLines: [],
    };
  }

  const keyValueLines = lines.filter((line) => /^[^:]{1,80}:\s+.+$/.test(line));
  if (keyValueLines.length > 0 && keyValueLines.length >= lines.length - 1) {
    const keyValues: Record<string, string> = {};
    const leadingLines = lines.filter((line) => !/^[^:]{1,80}:\s+.+$/.test(line));
    for (const line of keyValueLines) {
      const separatorIndex = line.indexOf(":");
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key !== "") {
        keyValues[key] = value;
      }
    }
    return {
      format: "key_value_lines",
      lineCount: lines.length,
      previewLines: lines.slice(0, 20),
      leadingLines: leadingLines.length > 0 ? leadingLines : undefined,
      keyValues,
    };
  }

  const table = parsePlainTextTable(lines);
  if (table) {
    return {
      format: "tabular_text",
      lineCount: lines.length,
      previewLines: lines.slice(0, 20),
      table,
    };
  }

  return {
    format: "plain_text",
    lineCount: lines.length,
    previewLines: lines.slice(0, 20),
  };
}

function normalizeRuntimeBody(body: string): string {
  const trimmed = body.trim();
  if (/<[a-zA-Z][\s\S]*>/.test(trimmed) && /<\/[a-zA-Z]/.test(trimmed)) {
    return decodeXml(trimmed.replace(/<[^>]+>/g, "\n")).replace(/\n{2,}/g, "\n").trim();
  }
  return body;
}

function parsePlainTextTable(lines: string[]): { title?: string; headers: string[]; rows: string[][] } | undefined {
  if (lines.length < 2) {
    return undefined;
  }

  let startIndex = 0;
  let title: string | undefined;

  if (/:$/.test(lines[0]) && lines.length >= 3) {
    title = lines[0].slice(0, -1).trim();
    startIndex = 1;
  }

  const headerLine = lines[startIndex];
  const dataLine = lines[startIndex + 1];
  if (!headerLine || !dataLine) {
    return undefined;
  }

  const headers = splitColumns(headerLine);
  const firstRow = splitColumns(dataLine);
  if (headers.length < 2 || firstRow.length < 2 || headers.length !== firstRow.length) {
    return undefined;
  }

  const rows: string[][] = [];
  for (const line of lines.slice(startIndex + 1, startIndex + 21)) {
    const columns = splitColumns(line);
    if (columns.length === headers.length) {
      rows.push(columns);
    }
  }

  if (rows.length === 0) {
    return undefined;
  }

  return {
    title,
    headers,
    rows,
  };
}

function splitColumns(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}/)
    .map((column) => column.trim())
    .filter((column) => column !== "");
}
