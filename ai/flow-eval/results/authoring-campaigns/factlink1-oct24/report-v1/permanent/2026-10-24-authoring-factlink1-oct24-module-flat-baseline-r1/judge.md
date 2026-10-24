# authoring-factlink1-oct24-module-flat-baseline-r1 — fail (completed)

VERDICT: fail

NOR-REQ-1 applies to any non-empty ASCII string, so separator-only inputs such as `"___"` or `"   "` satisfy it and require a normalized result, while NOR-REQ-2 and the DbC pre-violation clause require `TypeError` for those same inputs; no exception or precedence is stated. This also departs from parent TOK-REQ-1, whose positive precondition requires at least one character other than a space, underscore, or hyphen. The required example table is present, but the overlapping normative requirements are contradictory.
