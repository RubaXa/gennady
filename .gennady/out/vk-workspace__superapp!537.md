# MR vk-workspace/superapp!537 — refactor: переработка архитектуры бандлов и коммуникации моста

> Стадия A · роль: author · reply_needed (ревью бота) · черновик, в GitLab НЕ постится. ⚠ — проверить в коде перед отправкой.

**1. Утечка подписок в `initOfflineBundleSync` — КРИТ → fix now.**
Согласен. unsubscribe теряется; на синглтоне при повторной инициализации копятся мёртвые колбеки. Фикс: собрать все unsubscribe внутри, вернуть единый `cleanup`, звать при teardown.
```ts
export function initOfflineBundleSync(): () => void {
  const unsubscribers: Array<() => void> = [];
  unsubscribers.push(WssaAuthService.get().subscribe(/* ... */));
  return () => { for (const u of unsubscribers) u(); unsubscribers.length = 0; };
}
```
Вызывающую сторону обновлю, чтобы хранила и звала `cleanup`.

**2. Потеря начальных событий из-за порядка инициализации — КРИТ → fix now.**
Беру **ленивое создание провайдера** (проще, лечит причину). Вариант с переподключением `_pipe.on` даёт новые гонки. Откладываю создание `TessellBridgeProvider` до момента, когда `setBridgeEventsListener(...)` отработал → `eventsListener` в конструкторе гарантированно определён, первый `extensions:updated` не теряется. Точку создания смотрю в `electron-provider.ts` / `main/index.ts`. ⚠ проверить, нет ли синхронного дёрганья провайдера до установки listener. Плюс лог-варнинг, когда listener не установлен.

**3. XSS через инъекцию JSON в `<script>` — WARNING → fix now.**
Согласен. `JSON.stringify` не экранирует `<`,`>`,`</`. Экранирую при сериализации в инлайн-скрипт (`buildOmicronScript`/`buildAppConfigScript`):
```ts
function serializeForScript(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/ /g, '\\u2028').replace(/ /g, '\\u2029');
}
```
Закрывает `</script>`, `<!--` и line/paragraph separators. Вариант с `textContent` не беру — переписывать инъекцию на DOM.

**4. Нейминг `push` → `update` — МИНОР → fix now.**
По смыслу заменяют состояние целиком, `push` вводит в заблуждение. Переименую в `update` (точнее `send`). ⚠ проверю охват по всем вызовам — публичная поверхность моста; внешним потребителям либо правлю, либо deprecated-алиас + чистка отдельной задачей.

**5. `buildHostMappingsFromExtensions` под новый `settings.resources` — МИНОР → проверю. ⚠**
Проверю, что хосты читаются из нового `settings.resources`, не из старого поля. Не адаптировано — поправлю в этом MR + тест на сборку маппинга. Отпишусь после проверки.

**6. Удалённые `extractBundleConfig`/`hasVersionChanged`/`bundle-manager.utils` — МИНОР → проверю. ⚠**
`rg -n "extractBundleConfig|hasVersionChanged|bundle-manager\.utils"` — если живые импорты есть, дочищу или верну. Ожидаю чисто (тайпчек проходит), подтвержу поиском.
