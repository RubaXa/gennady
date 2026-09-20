# Golden V1 corpus — E-22 / Batch 23A

`contract.json` pins the complete pre-self-migration repository tree to the peeled annotated-tag commit
`rc-baseline-1^{}` = `227c03a83830124fe2aa22541dd5374beb8a53c6`. The acceptance test extracts that immutable local Git
object into a fresh temporary root, commits the extracted bytes as that root's `HEAD` (so lazy checks see
the same unchanged baseline they saw in the original repository), and removes the root in `finally`.

The corpus bytes are not duplicated here: the pinned commit is already an ancestor of the release and is
the content-addressed frozen corpus. Missing tag/object evidence, a peeled-SHA mismatch, archive failure,
or an unreadable baseline fails the test; the test never fetches from the network and never skips.

The expected corpus result is deliberately red: exit `1` with the versioned
`ai/flow-eval/.baseline/sdd-check-227c03a8.json` error identities and zero new error identity. Warning
movement is compared separately by `(code, file, severity)`; it cannot be hidden inside a total count.
Changing V1 files or rebaselining this contract is outside Batch 23A and requires an explicit operator
decision.

Batch 23A closes E-22, E-23, and V14-3 only. E-17 is deferred to 23B after V14-2; exact E-18 release
validation is deferred to 23C.
