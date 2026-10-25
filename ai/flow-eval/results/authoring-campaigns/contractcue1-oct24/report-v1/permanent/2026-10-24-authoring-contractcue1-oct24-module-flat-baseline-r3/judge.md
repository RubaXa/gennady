# authoring-contractcue1-oct24-module-flat-baseline-r3 — fail (completed)

VERDICT: fail

NOR-REQ-1/NOR-REQ-2 and the Input/Outcome table correctly encode the requested normalization and rejection cases. However, `MODULE_CONTRACTS` contradicts this: its Precondition accepts any ASCII string, including empty and separator-only inputs, while its Postcondition promises a returned normalized value for such inputs; the same block then says empty/separator-only inputs throw `TypeError` without any exception or precedence in the Postcondition. Thus `""` and separator-only witnesses carry overlapping return and throw obligations.
