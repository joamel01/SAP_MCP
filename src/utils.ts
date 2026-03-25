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
