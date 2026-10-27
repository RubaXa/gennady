# Квалификация карты SDD в существующем проекте

SC1 проверяет общий контракт, ещё не установленный CLI и не поведение модели.
`CORE-PERFORMANCE.json` создаёт read-only benchmark над текущим Octavius: Git inventory,
одно настоящее чтение целевого файла, вычисление проекций без SDD/с порталом/с модулем и фазой.
Синтетические 1k/10k/50k деклараций измеряют масштабирование core отдельно от диска и LLM.
Исходный Octavius не изменяется; его исходники и имена путей в отчёт не копируются.

Запуск из корня Gennady с новым output, без перезаписи прежних измерений:

```sh
node --import tsx ai/flow-eval/scripts/coverage-performance.ts --repo /Users/k.lebedev/Developer/octavius --out ai/flow-eval/results/2026-10-27-sdd-coverage-sc1/CORE-PERFORMANCE.json
node --import tsx --test shared/sdd/__tests__/coverage.test.ts ai/flow-eval/__tests__/sdd-coverage-brownfield.test.ts
```

План и оставшиеся этапы: [SDD-COVERAGE-PLAN.md](../../docs/SDD-COVERAGE-PLAN.md).
Измерение core не доказывает скорость всего CLI: actual cold/warm CLI и I/O-профиль обязательны
после подключения адаптеров. Timing assertions в unit не используются.

## Результаты

`CORE-PERFORMANCE.json` и `CORE-PERFORMANCE-2.json` — промежуточные source-hash-bound замеры.
В обоих moduleAndPhase.canProceed=false: прототип ошибочно отвергал настоящий путь маршрута
`pages/[...slug].tsx` в общем File Mapping как pattern, даже при проверке другого фазового файла.
Эти результаты сохранены, не перекрашены.

`CORE-PERFORMANCE-3.json` относится к исправленному literal-path core и полным контрактам типов.
В нём phase preparation canProceed=true, complete=false: заголовок ещё не появился и проверенным
владением не считается. Octavius unchanged=true, benchmark прочитал один исходник (7776 bytes),
зависимости и временные checkout не создавал. В report нет содержимого исходников или списка их путей.

| Нагрузка                                   | Median core ms | Max core ms |
| ------------------------------------------ | -------------: | ----------: |
| 3007 деклараций, одна фаза/одно наблюдение |           1.25 |        1.76 |
| 1000 файлов с корректным владением         |           1.68 |        2.17 |
| 10000 файлов с корректным владением        |          14.54 |       21.79 |
| 50000 файлов с корректным владением        |          77.73 |      102.79 |

Каждый срез — 9 повторов после 3 warmup. Это описательный single-host benchmark, не обещание
latency всего CLI. RSS342736KiB — high-water всего процесса с повторными 50k workloads.
