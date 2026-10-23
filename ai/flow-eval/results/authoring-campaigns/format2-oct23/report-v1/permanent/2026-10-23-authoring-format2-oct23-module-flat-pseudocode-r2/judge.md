# authoring-format2-oct23-module-flat-pseudocode-r2 — fail (completed)

VERDICT: fail

NOR-REQ-1 applies to any string containing at least one ASCII character other than space/underscore/hyphen, without restricting the input to ASCII-only. NOR-REQ-2 instead requires `TypeError` when the input contains any non-ASCII character. For mixed input such as `"Aé"`, both conditions hold: NOR-REQ-1 requires returning a normalized token while NOR-REQ-2 requires throwing, with no stated exception or precedence. The parent TOK-REQ-1 avoids this by specifying an “ASCII-строка,” and the module contract’s Pre correctly adds “не содержащая не-ASCII”; the module requirement is therefore inconsistent. The required example rows are present and correct, but they do not resolve this mixed-input conflict.
