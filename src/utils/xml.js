export function xmlCommitMessageToJson(xmlString) {
    // 1. Сначала изолируем основной блок <message>. 
    // Это гарантирует, что мы работаем только в нужном контексте и не захватим лишние данные.
    const messageBlock = String(xmlString).match(/<message[\s\S]*?>[\s\S]*?<\/message>/)?.[0];

    if (!messageBlock) {
        return null; // Если блок не найден, дальнейшая обработка бессмысленна.
    }

    // Вспомогательная функция для извлечения данных уже из ИЗОЛИРОВАННОГО блока.
    const extract = (regex) => messageBlock.match(regex)?.[1] || '';

    // 2. Извлекаем атрибуты из найденного блока.
    const type = extract(/type="([^"]+)"/);
    const icon = extract(/icon="([^"]+)"/);

    // 3. Извлекаем содержимое дочерних тегов.
    const subject = extract(/<subject>([\s\S]*?)<\/subject>/);
    const description = extract(/<description>([\s\S]*?)<\/description>/).replace(/\n\s+-/g, '\n-');
    
    return {
        type,
        icon,
        subject: subject?.trim() || null,
        description: description?.trim() || null
    };
}

/**
 * @typedef {Object} XmlNode
 * @purpose Описывает узел XML-дерева для промежуточного представления перед сериализацией.
 * @consumer review-verify-module
 * @property {string} tag Имя тега.
 * @property {Object<string, string>} [attrs] Атрибуты узла.
 * @property {XmlNode[] | string | string[]} [children] Дочерние узлы или текстовое содержимое.
 */

/**
 * @purpose Экранирует специальные символы в строке для безопасной вставки в XML.
 * @param {string} str Исходная строка, которая может содержать спецсимволы XML.
 * @returns {string} Безопасная строка, где спецсимволы заменены на сущности (&lt;, &gt; и т.д.).
 */
export function escapeXml(str) {
  if (!str) return '';
  return String(str).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * @purpose Сериализует объектное представление узла в валидную XML-строку.
 * @consumer review-verify-module
 * @param {XmlNode} node Узел для сериализации.
 * @param {number} [level=0] Уровень вложенности для формирования отступов (используется рекурсивно).
 * @returns {string} Форматированная XML-строка с отступами, готовая для записи в файл или вывода.
 */
export function serializeXmlNode(node, level = 0) {
  const indent = '  '.repeat(level);
  const { tag, attrs, children } = node;

  let attrsStr = '';
  if (attrs) {
    attrsStr = Object.entries(attrs)
      .filter(([_, v]) => v !== undefined && v !== null)
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
  let isMultiLine = false;

  if (Array.isArray(children)) {
    // Check if it is an array of strings or nodes
    const isStringArray = children.length > 0 && typeof children[0] === 'string';
    
    if (isStringArray) {
        // Array of strings -> join with newline
        content = children.map(c => escapeXml(c)).join('\n');
    } else {
        // Array of Nodes
        isMultiLine = true;
        content = '\n' + children.map(child => serializeXmlNode(child, level + 1)).join('\n') + '\n' + indent;
    }
  } else if (typeof children === 'string') {
    content = escapeXml(children);
  } else {
    // Single node object
    isMultiLine = true;
    content = '\n' + serializeXmlNode(children, level + 1) + '\n' + indent;
  }
  
  return `${indent}<${tag}${attrsStr}>${content}</${tag}>`;
}