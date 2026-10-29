# EverRule Prevent

Runs the approved prevention contracts in `.everrule/contracts` that a pull request touches, with your repository's own test runner, as a required check. A contract is a rule learned from an incident plus one executable test that failed on the broken code and passes on the fix.

The Action runs entirely in your CI. It reads files in your repository, runs your test runner, writes a record, and exits. It never contacts EverRule or any other service, needs no account and no secrets, and installs nothing: the evaluator is one bundled file run with `node`.

## Use

Copy `workflow-template.yml` to `.github/workflows/everrule.yml`, add the two lines in `CODEOWNERS.example` to your `CODEOWNERS` with your owners, and require the `everrule` check on your default branch. The workflow has no `paths` filter on purpose: a required check must report on every pull request; which contracts apply is decided inside the evaluator.

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: everrule/prevent-action@v1
  with: { mode: evaluate }
```

Inputs:

| Input | Default | Meaning |
|---|---|---|
| `mode` | `evaluate` | `evaluate` is the required check. `verify` proves a draft before approval: three passes at its fix, a failing assertion at the broken commit. |
| `working-directory` | `.` | Where the contracts' paths are relative to: the root, or a service folder in a monorepo. |
| `contracts-dir` | `.everrule/contracts` | Relative to `working-directory`. |
| `base-ref` | the pull request's or merge queue's base | Commit to diff against and to read approved contracts from. |
| `timeout-minutes` | `10` | Per contract; a test still running is stopped (exit 3, `TIMEOUT`). |
| `install-command` | empty | `verify` only: installs dependencies in each historical worktree. Empty links the current `node_modules`. |

## Exit codes

| Exit | Status | Meaning |
|---|---|---|
| 0 | `pass`, `no_applicable_contracts` | Every applicable contract passed, or the change touched none. |
| 1 | `behavior_fail` | The runner's own report shows the contract's test ran and an assertion failed. |
| 2 | `integrity_fail` | A contract or its test changed after approval, an approved contract was deleted without being retired, or a contract is invalid. |
| 3 | `infra_error` | The test could not run or report (`RUNNER_CRASH`, `DEPENDENCY_OR_SETUP`, `TIMEOUT`, `NO_REPORT`). When unsure, 3, never 1. |

Approval hashes are a tamper signal, not a control: the same pull request could recompute them. Code-owner review of `.everrule/` is the control.

Every run uploads its record (`everrule-evaluation`, schema in `schema/everrule-evaluation.v1.json`). Contracts follow `schema/everrule-contract.v1.json`; `.everrule/backlog.json` follows `schema/everrule-backlog.v1.json`.

## License

Apache-2.0 (`LICENSE`, `NOTICE`). The bundle includes zod under the MIT License (`THIRD_PARTY_LICENSES`).
