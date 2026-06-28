# vcs-reactions: Scope Specification

## scope-type

product

## 1. Vision & Primary Goal

Добавить emoji-реакции на комментарии MR/PR. AI Agent может поставить 👍 вместо текстового комментария. API-порт + GitLab/GitHub адаптеры + CLI `vcs-react`.

→ Parent: [../vcs.spec.md](../vcs.spec.md), [../../cli/cli.spec.md](../../cli/cli.spec.md)

## 2. Entity Inventory

| Name                 | Type         | Purpose                                        |
| -------------------- | ------------ | ---------------------------------------------- |
| `VcsReactionQuery`   | Value Object | Параметры реакции: project, iid, noteId, emoji |
| `VcsClientReactions` | Port         | Абстракция эмодзи-реакций: add, remove, list   |
| `VcsGitlabReactions` | Adapter      | GitLab award_emoji API                         |
| `VcsGithubReactions` | Adapter      | GitHub reactions API                           |
| `vcs-react`          | CLI Command  | Поставить/убрать реакцию на комментарий        |

## 3. Requirements

| ID      | Требование                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| FR-R-01 | `VcsClientReactions.add(query)` — порт: поставить эмодзи. `query: { project, iid, noteId, emoji }`                          |
| FR-R-02 | `VcsClientReactions.remove(query)` — порт: убрать свою реакцию                                                              |
| FR-R-03 | `VcsGitlabReactions.add` → `POST /projects/:id/merge_requests/:iid/notes/:note_id/award_emoji?name=<emoji>`                 |
| FR-R-04 | `VcsGithubReactions.add` → `POST /repos/:owner/:repo/issues/comments/:note_id/reactions` body `{content: "<mapped_emoji>"}` |
| FR-R-05 | Emoji mapping: CLI принимает unicode (👍) и маппит в GitLab name (thumbsup) / GitHub content (+1)                           |
| FR-R-06 | `vcs-react --ref <ref> --comment <id> --emoji <name>` — поставить реакцию                                                   |
| FR-R-07 | `vcs-react --ref <ref> --comment <id> --emoji <name> --remove` — убрать                                                     |

## 4. Emoji Mapping

| Unicode | GitLab     | GitHub   |
| ------- | ---------- | -------- |
| 👍      | thumbsup   | +1       |
| 👎      | thumbsdown | -1       |
| 😄      | smile      | laugh    |
| 🎉      | tada       | hooray   |
| 😕      | confused   | confused |
| ❤️      | heart      | heart    |
| 🚀      | rocket     | rocket   |
| 👀      | eyes       | eyes     |
| 🤡      | clown_face | —        |

## 5. Out-of-Scope

- Список реакций (list) — deferred
- Реакции на discussion/тред целиком (только note-level)
- Глобально-уникальный note_id для GitHub (review comments vs issue comments)
