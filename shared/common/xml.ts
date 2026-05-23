// @file: Описывает узел XML-дерева — тег, атрибуты и дочерние узлы или текст.
// @consumers: commit-gen
// @tasks: N/A

/**
 * @purpose Описывает узел XML-дерева — тег, атрибуты и дочерние узлы или текст.
 * @consumer commit-gen, review-verify, cat-gen
 */
export type XmlNode = {
  tag: string;
  attrs?: Record<string, string>;
  children?: XmlNode[] | string | string[] | XmlCdataNode;
};

/**
 * @purpose Представить текстовый XML-блок как CDATA-контент без escape спецсимволов.
 * @consumer xml serializer
 */
export type XmlCdataNode = {
  cdata: string;
};

/**
 * @purpose Извлечь из XML-строки блок <message> и преобразовать его в плоский объект для коммита.
 * @param xmlString Строка с XML (например, вывод команды или файл).
 * @returns Объект type, icon, subject, description или null, если блок <message> не найден.
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
 * @purpose Экранировать специальные символы в строке для безопасной вставки в XML.
 * @param str Исходная строка, которая может содержать <, >, &, ', ".
 * @returns Строка с заменёнными сущностями (&lt;, &gt;, &amp;, &apos;, &quot;).
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
 * @purpose Сериализовать объектное представление узла в валидную XML-строку с отступами.
 * @param node Узел XmlNode для сериализации.
 * @param [level] Уровень вложенности для отступов (по умолчанию 0).
 * @returns Форматированная XML-строка.
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
