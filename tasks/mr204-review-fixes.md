# Задание на исправление — MR!204 review findings

**MR:** [mail/messenger!204](https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/204)
**Дата:** 2026-08-07
**Статус:** ✅ Все исправления в `47fa17ae` · ✅ Оба ревьювера approve · ✅ Все треды resolved
**Источник:** ревью y.golubev (8 находок) + m.polyakova (4 находки) + бот planning-reviewer

---

## Follow-up (после approve, 2026-08-07 12:25)

### F0 — parseMention → обязательный параметр в flatRangesToDoc (MR!182)

**Файл:** `src/ui/rich-input/adapters/flat-ranges-to-doc.ts:10` (в бранче `rich-input-implementation`, MR!182)
**Суть:** y.golubev: «опциональные параметры это зло». `parseMention` должен быть обязательным — вызывающий обязан явно передать функцию или `null`. Тогда пропуск = ошибка компиляции, а не молчаливая потеря данных (как было в F1).
**Коллеры (2 шт.):** `message-doc-render.ts:18` (уже передаёт), `widget-chat-pane.svelte:200` (уже передаёт). Тесты (~7 вызовов): добавить явный `null` вторым аргументом.
**Фикс:**

1. `FlatToDocOpts` → `parseMention: ((text, range) => MentionAttrs | null) | null` (убрать `?`)
2. Все коллеры — явно передать `null` или функцию
3. Тесты — `flatRangesToDoc(input, null)` для вызовов без mention

---

## Блок A: widget-chat-pane.svelte (3 исправления + 2 теста)

### A1 🟠 P1 — parseMention в requestEdit

**Файл:** `src/components/widget-chat-pane/widget-chat-pane.svelte:193`
**Проблема:** `requestEdit` вызывает `flatRangesToDoc({ text: msg.body, ranges: msg.format ?? [] })` без опции `parseMention`. Mention-диапазон деградирует в сырой текст — `attrs.id` теряется, получатель не получает уведомления.
**Фикс:** добавить `{ parseMention }` по аналогии с `renderFormat` в `message-doc-render.ts:18-21`:

```ts
draft = flatRangesToDoc(
  { text: msg.body, ranges: msg.format ?? [] },
  { parseMention: (label, range) => ({ id: range.attrs?.id ?? '', label }) }
).doc;
```

### A2 🟡 P2 — exitEditMode при смене чата

**Файл:** `src/components/widget-chat-pane/widget-chat-pane.svelte:174-179`
**Проблема:** `$effect` на смену `selectedDialogId` сбрасывает только `replyTarget`. `editTarget`/`stashedDraft`/`draft` остаются — баннер редактирования и текст из чата A остаются в чате B.
**Фикс:** добавить `if (editTarget) exitEditMode()` симметрично сбросу replyTarget:

```ts
$effect(() => {
  void selectedDialogId;
  if (editTarget) exitEditMode();
  replyTarget = null;
});
```

### A3 ⚪ P3 — guard на Enter-путь в message-composer

**Файл:** `src/ui/message-composer/message-composer.svelte:39` (sendDisabled)
**Проблема:** Правило пустого документа (`sendDisabled`) живёт только на кнопке Send. Enter-путь rich-input вызывает `onSubmit` безусловно. Data-слой режет, но получается тихий no-op без обратной связи.
**Фикс:** добавить guard в `handleSubmit` виджета или в `onSubmit` композера — если `sendDisabled`, не вызывать submit. Проще всего: в `handleSubmit` виджета (`widget-chat-pane.svelte`) проверить `sendDisabled` и вернуться рано.
Либо: в `message-composer.svelte` передавать `sendDisabled` в rich-input и блокировать Enter-отправку на уровне плагина.

### TEST2 🧪 — тест на смену чата в режиме правки

**Файл:** `src/components/widget-chat-pane/widget-chat-pane.test.ts`
**Сценарий:** вход в правку → смена чата → баннер редактирования исчез, editTarget сброшен. Покрыть A2.

---

## Блок B: send-chat-message.mutation.ts (3 исправления)

### B1 🟡 P2 — нижняя граница offset/length + целочисленность

**Файл:** `packages/vkt-messenger/entities/chat/mutation/send-chat-message/send-chat-message.mutation.ts:29-30`
**Проблема:** `offset`/`length` объявлены как `v.number()`, проверка только сверху: `offset + length <= text.length`. Отрицательные/дробные значения проходят валидацию.
**Фикс:** добавить `v.minValue(0)` + `v.integer()` к offset/length в `FormatRangeSchema`:

```ts
const FormatRangeSchema = v.object({
  type: v.picklist(CHAT_FORMAT_VALUES),
  offset: v.pipe(v.number(), v.minValue(0), v.integer()),
  length: v.pipe(v.number(), v.minValue(0), v.integer()),
  attrs: v.optional(/* без изменений */),
});
```

### B2 ⚪ P3 — валидация attrs.id для mention

**Файл:** `packages/vkt-messenger/entities/chat/mutation/send-chat-message/send-chat-message.mutation.ts` (FormatRangeSchema + валидация)
**Проблема:** Если диапазон mention придёт без `id`/`attrs`, `buildMainPart` сгенерирует `@[]` — некорректный wire-формат.
**Фикс:** добавить `v.check` на уровне `MessageBodySchema` или `FormatRangeSchema`: для `type: 'mention'` требовать `attrs.id`. Либо в `buildMainPart` добавить guard — пропускать mention без id.

### B3 — устранение дублирования CHAT_FORMAT_VALUES (m.polyakova F2)

**Файлы:**

- `packages/vkt-messenger/entities/message/message-format.ts` (источник истины — TS-тип)
- `packages/vkt-messenger/entities/message/message-entity.ts:57-69` (дубликат)
- `packages/vkt-messenger/entities/chat/mutation/send-chat-message/send-chat-message.mutation.ts:13-25` (дубликат)
  **Проблема:** Массив определён в 3 местах. Расхождение не ловится компилятором.
  **Фикс:**

1. В `message-format.ts` экспортировать `CHAT_FORMAT_VALUES` как `as const` массив:

```ts
export const CHAT_FORMAT_VALUES = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'mention',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
] as const satisfies readonly ChatFormat[];
```

2. В `message-entity.ts` и `send-chat-message.mutation.ts` — импортировать из `message-format.ts`, удалить локальные копии.

---

## Блок C: send-chat-message.handler.ts (1 исправление)

### C1 ⚪ P3 — ?? → проверка непустоты при forward

**Файл:** `packages/vkt-messenger/entities/chat/mutation/send-chat-message/send-chat-message.handler.ts:96`
**Проблема:** `body?.text ?? forward?.text ?? ''` — при `body: { text: '' }` + `forward` пустая строка не nullish, fallback на `forward.text` не срабатывает.
**Фикс:** заменить на явную проверку непустоты:

```ts
const bodyText = (body?.text || undefined) ?? forward?.text ?? '';
```

Либо:

```ts
const bodyText = body?.text ? body.text : (forward?.text ?? '');
```

---

## Блок D: flush-outgoing-send.ts (1 исправление)

### D1 ⚪ P3 — расширить тип OutgoingSendParts.mainPart

**Файл:** `packages/vkt-messenger/provider-v1/shared/flush-outgoing-send.ts:22-29`
**Проблема:** `mainPart` типизирован `{ text: { plain: string } }`, но send-хендлер кладёт туда `buildMainPart(...)` с полем `format`. Тип занижает реальный payload.
**Фикс:** добавить `format?` в тип:

```ts
export interface OutgoingSendParts {
  mainPart?: {
    text: { plain: string };
    format?: Array<{ type: string; offset: number; length: number }>;
  };
  // ...
}
```

---

## Блок E: searchUsers — утечка подписок (1 исправление)

### E1 — кешировать handle и отписываться

**Файл:** `src/app/create-runtime-stores-context.ts:138-152`
**Проблема:** Каждое нажатие в @-режиме создаёт новый `DataQueryHandle`. Предыдущий не отписывается — висящие запросы накапливаются.
**Фикс:** кешировать последний handle, при новом вызове отписываться от предыдущего:

```ts
let lastSearchHandle: ReturnType<typeof runtime.client.api.users.search> | null = null;

searchUsers: (query: string) =>
  new Promise<MentionCandidate[]>((resolve, reject) => {
    lastSearchHandle?.unsubscribe?.();
    const handle = runtime.client.api.users.search({ query });
    lastSearchHandle = handle;
    const unsub = handle.subscribe((snap) => {
      if (snap.status === 'idle') {
        unsub();
        if (lastSearchHandle === handle) lastSearchHandle = null;
        resolve((snap.data?.list ?? []).map(toMentionCandidate));
      } else if (snap.status === 'error') {
        unsub();
        if (lastSearchHandle === handle) lastSearchHandle = null;
        reject(snap.error);
      }
    });
  }),
```

_Проверить наличие метода `unsubscribe` у `DataQueryHandle`._

---

## Блок F: IDB — инкремент эпохи данных (1 изменение)

### F1 — инкрементировать эпоху данных

**Суть:** `MessageRecord.format` изменил форму (`data` → `attrs`, старые имена форматов). Миграция не нужна (нулевая версия), но нужно инкрементировать эпоху данных, чтобы IDB-кэш сбросился при деплое.
**Действие:** найти константу эпохи данных в проекте (обычно `DATA_EPOCH` или `DB_VERSION`) и инкрементировать.

---

## Блок G: CI — разобраться с microfrontend (1 исследование)

### G1 — проверить изменение .gitlab-ci.yml

**Суть:** m.polyakova заметила перевод с `merge-train` на `microfrontend` + `build:library`. **Этого изменения нет в диффе MR!204** — оно в целевом бранче `rich-input-implementation` (MR!182).
**Действие:** проверить `.gitlab-ci.yml` в target-бранче — осознанное ли это изменение, не ломает ли выкатку. Добавить в description MR!204 примечание.

---

## Блок H: TEST1 — регресс-тест updateMsgId (1 тест)

### TEST1 🧪 — тест на сериализацию updateMsgId голым числом

**Файл:** `packages/vkt-messenger/provider-v1/handlers/messages/messages-edit.handler.test.ts`
**Проблема:** `int64-id.test.ts` покрывает helper изолированно, но нет теста, что `serializeBody` над реальными edit-параметрами выдаёт `"updateMsgId": <голое число>`. Именно закавыченный updateMsgId был багом 40000.
**Фикс:** добавить тест: построить edit-параметры → прогнать через `serializeBody` → проверить JSON на `"updateMsgId": <число без кавычек>`.

---

## Блок I: Visual baselines — переснять (1 действие)

### I1 — переснять бейзлайны widget-chat-pane

**Суть:** 2 теста падают (header-elevation diff 3.13%, input-elevation diff 2.21%) — ожидаемо от замены message-input-box на message-composer.
**Действие:** после approve вида выполнить:

```bash
npx tsx packages/uikit-visual/scripts/capture-widget-reference.ts widget-chat-pane
```

---

## Закрыть без правок (уже проверено):

- **persons в ingestMessages** — отложенное решение (P4-persons-wiring из VMEN-018), не баг
- **minLength(1) для body.text** — сломает картинки/forward/geo без текста (бэкенд принимает)
- **requestEdit + stashedDraft** — совпадает с поведением legacy-клиента (молчаливый overwrite)
- **EMPTY_CHAT_DOC → фабрика** — ProseMirror не мутирует входной документ

---

## Итого: 14 исправлений, 3 закрыты без правок

| #   | Блок  | Что                                      | Приоритет |
| --- | ----- | ---------------------------------------- | --------- |
| 1   | A1    | parseMention в requestEdit               | 🟠 P1     |
| 2   | A2    | exitEditMode при смене чата              | 🟡 P2     |
| 3   | B1    | offset/length: minValue(0) + integer     | 🟡 P2     |
| 4   | B3    | CHAT_FORMAT_VALUES в один источник       | 🟡 P2     |
| 5   | G1    | Разобраться с CI microfrontend           | 🟡 P2     |
| 6   | I1    | Переснять визуальные бейзлайны           | —         |
| 7   | A3    | Guard на Enter-путь                      | ⚪ P3     |
| 8   | B2    | Валидация attrs.id для mention           | ⚪ P3     |
| 9   | C1    | ?? → проверка непустоты при forward      | ⚪ P3     |
| 10  | D1    | Расширить тип OutgoingSendParts.mainPart | ⚪ P3     |
| 11  | E1    | Кешировать handle в searchUsers          | —         |
| 12  | F1    | Инкремент эпохи данных                   | 🟠 P1     |
| 13  | TEST1 | Регресс-тест updateMsgId                 | 🧪        |
| 14  | TEST2 | Тест на смену чата в правке              | 🧪        |

---

## 🔴 Pipeline fix — тест манифеста (блокирует влитие)

**Джоба:** `mc:jest` — 1 тест упал

```
FAIL  vkt-data-epoch-entity-manifest.test.ts
  TC-01: expected 17 to be 16
```

**Причина:** `VKT_DATA_EPOCH` поднят 16→17, но тест-манифест ждёт 16.

### Файл: `packages/vkt-messenger/runtime/vkt-data-epoch-entity-manifest.test.ts`

1. **Строка 62:** `expect(VKT_DATA_EPOCH).toBe(16)` → `.toBe(17)`
2. **Строка 48:** переименовать `MANIFEST_AT_EPOCH_16` → `MANIFEST_AT_EPOCH_17`
3. **Строки 44-47:** обновить комментарий — упомянуть причину бампа (MessageEntity.format: data→attrs)
4. **Манифест:** проверить, изменилась ли версия `message` (сейчас v7). Если формат `data→attrs` меняет персистентную форму строки — bump `{ name: 'message', version: 7 }` → `version: 8`.
5. Убедиться, что `REGISTERED_ENTITIES` соответствует фактическому списку зарегистрированных сущностей.
