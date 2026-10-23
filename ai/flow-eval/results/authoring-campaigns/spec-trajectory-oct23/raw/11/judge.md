# authoring-spec-trajectory-oct23-scope-product-baseline-r2 — fail (completed)

VERDICT: fail

TOK-REQ-1 applies to any non-empty ASCII string and requires normalization, while TOK-REQ-3 requires `TypeError` for separator-only input, which is itself a non-empty ASCII string. The artifact gives no precedence or exclusion, so inputs such as `"___"` or `" - "` have two incompatible mandated outcomes. The rules row “Normalize only ASCII letters, ASCII spaces, underscores and hyphens” also leaves digit handling ambiguous against TOK-REQ-1’s acceptance of all non-empty ASCII input. The required example table is present and the handoff remains pending, but the core contract conflict blocks a pass.
