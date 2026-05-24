// @file: XML tree node — tag, attributes, child nodes or text.
// @consumers: commit-gen
// @tasks: N/A

/**
 * @purpose XML tree node — tag, attributes, child nodes or text.
 * @consumer commit-gen, review-verify, cat-gen
 */
export type XmlNode = {
  /** @purpose XML tag name (e.g. 'message', 'commit'). */
  tag: string;
  /** @purpose Optional key-value attributes on the tag. */
  attrs?: Record<string, string>;
  /** @purpose Child content: nested nodes, text, string array, or CDATA. */
  children?: XmlNode[] | string | string[] | XmlCdataNode;
};

/**
 * @purpose Represent XML block as CDATA content without escaping special chars.
 * @consumer xml serializer
 */
export type XmlCdataNode = {
  /** @purpose Raw CDATA text content (not escaped). */
  cdata: string;
};

/**
 * @purpose Extract \<message\> block from XML string and convert to flat object for commit.
 * @param xmlString XML string (e.g. command output or file).
 * @returns Object type, icon, subject, description or null if \<message\> block not found.
 */
export function xmlCommitMessageToJson(xmlString: string): {
  type: string;
  icon: string;
  subject: string | null;
  description: string | null;
} | null {
  const messageBlock = String(xmlString).match(/<message[\s\S]*?>[\s\S]*?<\/message>/)?.[0];

  if (!messageBlock) {
    return null;
  }

  const extract = (regex: RegExp): string => messageBlock.match(regex)?.[1] ?? '';

  const type = extract(/type="([^"]+)"/);
  const icon = extract(/icon="([^"]+)"/);
  const subject = extract(/<subject>([\s\S]*?)<\/subject>/);
  const description = extract(/<description>([\s\S]*?)<\/description>/).replace(/\n\s+-/g, '\n-');

  return {
    type,
    icon,
    subject: subject?.trim() || null,
    description: description?.trim() || null,
  };
}

/**
 * @purpose Escape special characters in string for safe XML insertion.
 * @param str Source string that may contain \<, \>, &, ', ".
 * @returns String with replaced entities (&lt;, &gt;, &amp;, &apos;, &quot;).
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return String(str).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * @purpose Serialize XmlNode object to indented XML string.
 * @param node XmlNode to serialize.
 * @param [level] Nesting level for indentation (default 0).
 * @returns Formatted XML string.
 */
export function serializeXmlNode(node: XmlNode, level = 0): string {
  const indent = '  '.repeat(level);
  const { tag, attrs, children } = node;

  let attrsStr = '';
  if (attrs) {
    attrsStr = Object.entries(attrs)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
      .join('');
  }

  if (children === undefined || children === null) {
    return `${indent}<${tag}${attrsStr} />`;
  }

  if (Array.isArray(children) && children.length === 0) {
    return `${indent}<${tag}${attrsStr} />`;
  }

  let content = '';

  if (Array.isArray(children)) {
    const isStringArray = children.length > 0 && typeof children[0] === 'string';

    if (isStringArray) {
      content = (children as string[]).map((c) => escapeXml(c)).join('\n');
    } else {
      content =
        '\n' +
        (children as XmlNode[]).map((child) => serializeXmlNode(child, level + 1)).join('\n') +
        '\n' +
        indent;
    }
  } else if (typeof children === 'string') {
    content = escapeXml(children);
  } else if ('cdata' in children) {
    const safeCdata = String(children.cdata).replaceAll(']]>', ']]]]><![CDATA[>');
    content = `<![CDATA[${safeCdata}]]>`;
  } else {
    content = '\n' + serializeXmlNode(children, level + 1) + '\n' + indent;
  }

  return `${indent}<${tag}${attrsStr}>${content}</${tag}>`;
}
