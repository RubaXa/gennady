# REL-18 — RC evidence pack

Все команды выполнены на одном чистом immutable commit `d76a5ec5d04f4a8415908b091f178f283f20b796`. Логи собирались во временном каталоге вне репозитория; versioned pack материализован только после успешных команд и повторной проверки чистоты дерева.

- Node: `v22.23.2`; npm: `10.9.8`; platform: `darwin/arm64`.
- Node executable: `/Users/k.lebedev/.local/share/mise/installs/node/22.23.2/bin/node`.
- Migration dry-run: 12 scope × 2 rounds; каждый результат — exact `no-op — уже мигрирован в v2`.
- `format` здесь означает check-only script `prettier --check`; никакой write-format в evidence run нет.
- Локальные прежние `dist/`, `coverage/` и receipts не используются как evidence: `build` и `test` выполняются заново в этой матрице.
- Exact E-18 Swift round-trip не входит в этот pack и остаётся отдельной release validation на хосте с реальным Xcode/Tuist Cloud.

| ID                              | Команда                                                                         | Exit | Raw log                                  | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- | ---: | ---------------------------------------- | ------------------------------------------------------------------ |
| `type-check`                    | `npm run type-check`                                                            |    0 | `logs/type-check.log`                    | `9c1b29c328f41f4f49d90aaf7bf2de7e3652d831c5df50a7bea69e7cb98e0f20` |
| `format-check`                  | `npm run format`                                                                |    0 | `logs/format-check.log`                  | `a70e3032ad7d51e4e0ff413f992a608c5530ecfba4c8957a9f70c824ded156c3` |
| `lint`                          | `npm run lint`                                                                  |    0 | `logs/lint.log`                          | `05e3017dd0444ce3f9d7dffeacc1c2d721f0278d69a8c04b8f59927265aca0f1` |
| `audit-sdd-templates`           | `npm run audit:sdd-templates`                                                   |    0 | `logs/audit-sdd-templates.log`           | `d4c8e8f4e3bf018accfdbcec7b5781d196dee9dd38f1cb96609910767fb9822e` |
| `build`                         | `npm run build`                                                                 |    0 | `logs/build.log`                         | `4e86184f034a7a53c9bcdcb72bd90d5d51cf497bcfc00d2f4f033757c4cb4fa5` |
| `test`                          | `npm test`                                                                      |    0 | `logs/test.log`                          | `f6d8a3398bf393bb522928063e6fed9ad2f8ce6ea310ff099bd5958aad859b31` |
| `migration-1-agent-inbox`       | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-inbox`       |    0 | `logs/migration-1-agent-inbox.log`       | `a6388e3306b7af8e3dea45ba5e2b2a8ea4992225aa283c6c32bdf5742134780a` |
| `migration-1-agent-mon`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-mon`         |    0 | `logs/migration-1-agent-mon.log`         | `619880dee9f32b66649e7707a62d036160552bc2126a346c4d0e674ced400475` |
| `migration-1-agent-mon-cli`     | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-mon-cli`     |    0 | `logs/migration-1-agent-mon-cli.log`     | `914889936e88e051d1367df1f4f806c3ae9ab9648f6243b30661250ae9b9903f` |
| `migration-1-agent-run`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-run`         |    0 | `logs/migration-1-agent-run.log`         | `b0bcf31727e1029a745bc848839d8afb06a5a358d1db410e8edd62b31f3bf540` |
| `migration-1-ai-skills`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope ai-skills`         |    0 | `logs/migration-1-ai-skills.log`         | `c4f08d1dca87f574a4ded9fa909049dded41a7fe076dc9c866ea9eaeac346e23` |
| `migration-1-cli`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope cli`               |    0 | `logs/migration-1-cli.log`               | `1a49ba081a7cd4340640df65415898045d70a266bb7dfc45af8d4faf92b9478a` |
| `migration-1-dbc`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope dbc`               |    0 | `logs/migration-1-dbc.log`               | `319208124b8fc253d51121940e4ed1ed86bc84274c10fdafe00bba640dd94bc6` |
| `migration-1-infra-base`        | `node --import tsx cli/gennady.ts sdd-migrate move . --scope infra-base`        |    0 | `logs/migration-1-infra-base.log`        | `1c912982a89064e74e98dbc9d338b4702621af28acd283e96786689f3747d7ae` |
| `migration-1-infra-npm-publish` | `node --import tsx cli/gennady.ts sdd-migrate move . --scope infra-npm-publish` |    0 | `logs/migration-1-infra-npm-publish.log` | `51368f8a67f9985073ff8fb11b38ed5c7c79c45ec7a92c71a76ca407967aa4c0` |
| `migration-1-mr-stats`          | `node --import tsx cli/gennady.ts sdd-migrate move . --scope mr-stats`          |    0 | `logs/migration-1-mr-stats.log`          | `37c66c46833aa97cd078b540a1746e36bea80760db33b6036fe798513fbedef9` |
| `migration-1-shared`            | `node --import tsx cli/gennady.ts sdd-migrate move . --scope shared`            |    0 | `logs/migration-1-shared.log`            | `5f3922946bb432d765cdc7c838bec973d03a3c2d2bab8d285d411b308254e36b` |
| `migration-1-vcs`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope vcs`               |    0 | `logs/migration-1-vcs.log`               | `3438c82bbc385e4baf2329d0a773f308c3ef5912cdf2fc72d9ab91156a47b9c8` |
| `migration-2-agent-inbox`       | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-inbox`       |    0 | `logs/migration-2-agent-inbox.log`       | `a6388e3306b7af8e3dea45ba5e2b2a8ea4992225aa283c6c32bdf5742134780a` |
| `migration-2-agent-mon`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-mon`         |    0 | `logs/migration-2-agent-mon.log`         | `619880dee9f32b66649e7707a62d036160552bc2126a346c4d0e674ced400475` |
| `migration-2-agent-mon-cli`     | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-mon-cli`     |    0 | `logs/migration-2-agent-mon-cli.log`     | `914889936e88e051d1367df1f4f806c3ae9ab9648f6243b30661250ae9b9903f` |
| `migration-2-agent-run`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope agent-run`         |    0 | `logs/migration-2-agent-run.log`         | `b0bcf31727e1029a745bc848839d8afb06a5a358d1db410e8edd62b31f3bf540` |
| `migration-2-ai-skills`         | `node --import tsx cli/gennady.ts sdd-migrate move . --scope ai-skills`         |    0 | `logs/migration-2-ai-skills.log`         | `c4f08d1dca87f574a4ded9fa909049dded41a7fe076dc9c866ea9eaeac346e23` |
| `migration-2-cli`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope cli`               |    0 | `logs/migration-2-cli.log`               | `1a49ba081a7cd4340640df65415898045d70a266bb7dfc45af8d4faf92b9478a` |
| `migration-2-dbc`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope dbc`               |    0 | `logs/migration-2-dbc.log`               | `319208124b8fc253d51121940e4ed1ed86bc84274c10fdafe00bba640dd94bc6` |
| `migration-2-infra-base`        | `node --import tsx cli/gennady.ts sdd-migrate move . --scope infra-base`        |    0 | `logs/migration-2-infra-base.log`        | `1c912982a89064e74e98dbc9d338b4702621af28acd283e96786689f3747d7ae` |
| `migration-2-infra-npm-publish` | `node --import tsx cli/gennady.ts sdd-migrate move . --scope infra-npm-publish` |    0 | `logs/migration-2-infra-npm-publish.log` | `51368f8a67f9985073ff8fb11b38ed5c7c79c45ec7a92c71a76ca407967aa4c0` |
| `migration-2-mr-stats`          | `node --import tsx cli/gennady.ts sdd-migrate move . --scope mr-stats`          |    0 | `logs/migration-2-mr-stats.log`          | `37c66c46833aa97cd078b540a1746e36bea80760db33b6036fe798513fbedef9` |
| `migration-2-shared`            | `node --import tsx cli/gennady.ts sdd-migrate move . --scope shared`            |    0 | `logs/migration-2-shared.log`            | `5f3922946bb432d765cdc7c838bec973d03a3c2d2bab8d285d411b308254e36b` |
| `migration-2-vcs`               | `node --import tsx cli/gennady.ts sdd-migrate move . --scope vcs`               |    0 | `logs/migration-2-vcs.log`               | `3438c82bbc385e4baf2329d0a773f308c3ef5912cdf2fc72d9ab91156a47b9c8` |
