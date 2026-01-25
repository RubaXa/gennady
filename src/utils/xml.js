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