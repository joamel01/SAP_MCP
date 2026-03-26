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
