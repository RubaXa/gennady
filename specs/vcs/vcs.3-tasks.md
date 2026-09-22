# Tasks: vcs

## Scope Spec

- [Scope spec](./vcs.spec.md)

## Cascade Table

<!-- ЗАПОЛНЯЕТ АГЕНТ: действующие правила scope из Scope Graph (транзитивное замыкание depends-on). -->

## Inter-Module DAG

```mermaid
graph TD
  %% кросс-модульных зависимостей нет
```

## Tracker

| Task-ID      | Title                                                                                 | Module            | Dependencies | Status   | Reopens |
| ------------ | ------------------------------------------------------------------------------------- | ----------------- | ------------ | -------- | ------- |
| VC-headers   | vcs-client: file headers + DBC contracts                                              | vcs-client        | —            | [x] DONE | —       |
| VC-url       | vcs-client: Entities + URL parser                                                     | vcs-client        | —            | [ ] TODO | —       |
| VC-fileport  | vcs-client: Abstract ports (RepositoryFiles + optional MergeDiscussions + getChanges) | vcs-client        | VC-url       | [ ] TODO | —       |
| VC-gitlab    | vcs-client: GitLab adapters (RepositoryFiles + getChanges)                            | vcs-client        | VC-fileport  | [ ] TODO | —       |
| VC-github    | vcs-client: GitHub adapters (Client + MergeRequests + RepositoryFiles)                | vcs-client        | VC-fileport  | [ ] TODO | —       |
| VC-approve   | Метод approve на MergeRequests порте                                                  | vcs-client        | —            | [ ] TODO | —       |
| VC-resolve   | Метод resolveDiscussion на MergeDiscussions порте                                     | vcs-client        | —            | [ ] TODO | —       |
| VC-unappr    | unapprove() на MergeRequests порте                                                    | vcs-client        | —            | [x] DONE | —       |
| VC-todos     | todoIds + markTodoDone (Inbox порт)                                                   | vcs-client        | —            | [ ] TODO | —       |
| VC-noteedit  | updateNote/deleteNote порт + адаптер                                                  | vcs-client        | —            | [x] DONE | —       |
| VC-pipeline  | getPipeline порт + адаптер                                                            | vcs-client        | —            | [ ] TODO | —       |
| VC-jobs      | VcsClientPipeline порт + VcsGitlabPipeline адаптер                                    | vcs-client        | —            | [ ] TODO | —       |
| VC-drafts    | —                                                                                     | vcs-client        | —            | [ ] TODO | —       |
| VMM-core     | API core: query types + abstract port for MR create/update                            | vcs-mr-management | —            | [ ] TODO | —       |
| VMM-glcreate | GitLab adapter: MR create + update                                                    | vcs-mr-management | VMM-core     | [ ] TODO | —       |
| VMM-gh-crud  | GitHub adapter: MR/PR create + update + getList + getByIid                            | vcs-mr-management | VMM-core     | [ ] TODO | —       |

## Decision Log (scope task level)

<!-- <ACR>-DL-N scope-уровневых решений декомпозиции/планирования. -->
