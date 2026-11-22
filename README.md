# EverRule Prevent

A required check that blocks a pull request when it would break a rule your team approved. A rule is a sentence that must stay true plus one test: learned from an incident, where the test failed on the broken code and passes on the fix, or written by your team.

The check runs entirely in your CI. It reads files in your repository, runs your own test runner, writes a record, and exits. It never contacts EverRule or any other service, needs no account and no secrets, and installs nothing: it is one bundled file run with `node`.

In the files, a rule is called a contract and lives in `.everrule/contracts`.

## Install

One command writes the workflow, the two code-owner lines and a first draft rule, and never overwrites a file that is already there:

```bash
git clone --depth 1 --branch v1 https://github.com/everrule/prevent-action /tmp/prevent-action
```

```bash
node /tmp/prevent-action/dist/everrule-evaluate.mjs init --owner @your-org/payments-platform --runner vitest
```

Then require the `everrule` check on your default branch. By hand, the same three steps:

1. Copy `workflow-template.yml` to `.github/workflows/everrule.yml`.
2. Add the two lines in `CODEOWNERS.example` to your `CODEOWNERS`, with your owners.
3. Require the `everrule` check on your default branch.

The workflow has no `paths` filter on purpose: a required check must report on every pull request. Which rules apply to a change is decided inside the check.

```yaml
- uses: actions/checkout@v7
  with: { fetch-depth: 0 }
- uses: everrule/prevent-action@v1
  with: { mode: evaluate }
```

Every setting has a working default:

| Input | Default | Meaning |
|---|---|---|
| `mode` | `evaluate` | `evaluate` is the required check. `verify` proves a draft rule before approval: three passes at its fix, a failing assertion at the broken commit. A draft that names only the broken commit is run there once and reported as reproduced or not; that is not a verification. `diagnose` then searches the history behind that commit for the earliest one where the test fails. |
| `working-directory` | `.` | Where the rules' paths are relative to: the root, or a service folder in a monorepo. |
| `contracts-dir` | `.everrule/contracts` | Relative to `working-directory`. |
| `base-ref` | the pull request's or merge queue's base | Commit to compare against and to read approved rules from. |
| `timeout-minutes` | `10` | Per rule; a test still running is stopped (exit 3, `TIMEOUT`). |
| `install-command` | empty | `verify` and `diagnose`: installs dependencies in each historical worktree. Empty links the current `node_modules`. |
| `depth` | `50` | `diagnose` only: how many first-parent commits behind the failing one to search. |
| `max-runs` | `12` | `diagnose` only: the most test runs to spend on one draft. |

## Your first rule in ten minutes

This example is a rule your team writes itself. It uses Vitest; Jest (`jest`), pytest (`pytest`) and Node's test runner (`node-test`, needs `tsx`) work the same way.

**1. Write the test**, as a new file, in your own runner. `.everrule/tests/refund-limit.test.js`:

```js
import { expect, test } from "vitest";
import { refund } from "../../src/refund.js";

test("a refund can never exceed the original charge", () => {
  const charge = { amount: 1000, refunded: 0 };
  refund(charge, 600);
  expect(() => refund(charge, 600)).toThrow();
});
```

**2. Write the rule.** `.everrule/contracts/ER-TEAM-001.json`:

```json
{
  "id": "ER-TEAM-001",
  "origin": "team",
  "requirement": { "statement": "A refund can never exceed the original charge." },
  "scope": { "paths": ["src/**"] },
  "test": { "path": ".everrule/tests/refund-limit.test.js", "runner": "vitest", "required": true },
  "verification": { "mode": "asserted", "basis": "Payments policy: refunds are capped at the captured amount." },
  "approval": { "status": "draft" }
}
```

`scope.paths` says which changes the rule watches: the test runs only when a pull request touches them. `basis` is why the team believes the rule.

**3. Approve it.** A draft never runs. The rule's owner records the approval, from the repository root:

```bash
git clone --depth 1 --branch v1 https://github.com/everrule/prevent-action /tmp/prevent-action
```

```bash
node /tmp/prevent-action/dist/everrule-evaluate.mjs approve .everrule/contracts/ER-TEAM-001.json --name "Alex Morgan" --role "Payments service owner"
```

This writes the approver and two fingerprints into the rule's file, tying the approval to this exact rule and this exact test.

**4. Open a pull request** with both files. From then on, a pull request that touches `src/**` and breaks the rule is blocked and told why: the rule, who approved it, and what the test saw. A pull request that touches nothing in scope passes without running the test.

To change the rule or its test later, change them in a pull request and have the owner run `approve` again. Until then the check fails, naming the rule.

A team-written rule is enforced like any other, but the check says plainly that it is not proven against a failure. A rule that comes from an incident is proven first: `verify` mode runs its test on the commit before the fix, where it must fail, and on the fix, where it must pass three times.

## Results

| Exit | Status | Meaning |
|---|---|---|
| 0 | `pass`, `no_applicable_contracts` | Every rule the change touches passed, or it touched none. |
| 1 | `behavior_fail` | Blocked: a rule's test ran and an assertion failed, as shown by the runner's own report. |
| 2 | `integrity_fail` | Blocked: a rule or its test changed after approval, an approved rule was deleted without being retired, or a rule's file is invalid. |
| 3 | `infra_error` | The test could not run or report (`RUNNER_CRASH`, `DEPENDENCY_OR_SETUP`, `TIMEOUT`, `NO_REPORT`). When unsure, 3, never 1. |

A passing check lists what it did not verify for the rules a change touched: a test that could not run, a rule not proven against a failure, a proof made only at the service boundary, and any case the test is known not to cover.

The fingerprints show that a rule changed after approval; they do not stop it, because the same pull request could write new ones. Code-owner review of `.everrule/` is what stops a rule being loosened.

`verify` reports four results separately: behavior, incident resolution, regression safety and integrity. It never runs your other tests, so regression safety is always "not run by this tool": your own CI's checks on the fix cover it. `diagnose` reports the most likely introducing change with every run it made and its limits; a commit that cannot run is listed as unknown, and the result is never a certain cause.

Every run uploads its record (`everrule-evaluation`, schema in `schema/everrule-evaluation.v1.json`; `verify` and `diagnose` upload `everrule-verification` and `everrule-diagnosis`). Rules follow `schema/everrule-contract.v1.json`; `.everrule/backlog.json` follows `schema/everrule-backlog.v1.json`.

## License

Apache-2.0 (`LICENSE`, `NOTICE`). The bundle includes zod under the MIT License (`THIRD_PARTY_LICENSES`).
