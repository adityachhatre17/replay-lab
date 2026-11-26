# Replay Lab Codex Evidence Pack

**GeeksforGeeks × OpenAI Build with Codex · Solo project**

## Project and result

Checkout can pass UAT while still failing against legacy production records. Replay Lab takes a prepared fixture, runs the same checkout case through original and patched logic, and shows where their outcomes diverge. The synthetic legacy order has a missing currency. The original logic returns 500 and records zero payments. The patch resolves currency from the account and returns 200 with exactly one stub payment. The saved case can be rerun and shared as a team result.

**Implementation scope.** Both logic versions run in one Spring Boot service, each with its own PostgreSQL transaction and temporary tables. The demo uses prepared data and a local payment stub. The earlier browser simulator is a separate mode. The incident brief shown in the prototype is sample text.

## Eight-stage evidence

The supplied contest rubric confirms **Understand** and **Automate**. The six labels between them describe the work in this project. Confirm their official names against the workshop materials before submission.

### 1. Understand

The builder identified the test-data gap after discussing production-only bugs that remain invisible in development and UAT. Codex helped turn it into a concrete question with an observable answer. Can the same legacy order fail under the original logic and succeed under the patch while recording one payment? The built-in dataset contains both a legacy order and a modern control. [Checkout fixture and user flow](../src/CheckoutReplay.jsx)

### 2. Scope

The builder chose React and Spring Boot and narrowed the first working replay to checkout. Codex translated “use the whole dataset or a chunk” into two fixture scopes. One seeds all records. The other seeds the selected order and its referenced account. The same order is replayed in both scopes. This kept the first version demonstrable while preserving the relationship required by the patch. [Fixture preparation](../backend/src/main/java/lab/replay/ReplayController.java)

### 3. Design

Codex iterated on the workspace in response to builder feedback. The UI evolved from an incident comparison into an ordered flow with component states and logs. Prepared fixture import and the actual checkout traces became the primary sandbox flow. The builder chose the light and dark palettes, moved theme selection to the top bar, and added profile access there. Codex used the browser to exercise the early scenario flow and captured the default failure and an edited success path. [Scenario simulator](../src/ScenarioPreview.jsx), [Sandbox trace UI](../src/CheckoutReplay.jsx), [Workspace navigation](../src/main.jsx)

### 4. Implement

Codex edited React, Java, and SQL in the workspace, then built both applications with project tooling. The backend seeds relational fixtures, executes both logic paths, checks recorded payments, and stores the comparison and fixture for regression reruns. Organization accounts gained teams, membership through one-time invitations, and shared execution results. [Checkout implementation](../backend/src/main/java/lab/replay/ReplayController.java), [Replay storage](../backend/src/main/java/lab/replay/ReplayStore.java), [Team UI](../src/Teams.jsx)

### 5. Verify

Codex used terminal assertions through the local frontend proxy to check the legacy-order result, the modern control, and the two dataset scopes. It also verified that history survives sign-out, repeated saving produces one regression bookmark, and a second account cannot access or rerun a private case. Additional checks covered manager-only invitations, one-time redemption, and team-only visibility. These checks separate the user interface from the observable backend outcomes. [Repeatable core checkout checks](replay-smoke.mjs), [Access checks in team endpoints](../backend/src/main/java/lab/replay/TeamsController.java)

### 6. Debug and refine

The first end-to-end check through the existing Vite process returned 404 after the proxy configuration was added. Codex identified that the running process had started before the new configuration, restarted it, and reran the assertions successfully. In the UI, builder feedback exposed unreadable native dropdown options in dark mode. Codex replaced those simulator dropdowns with themed controls. [API proxy](../vite.config.js), [Simulator dropdown](../src/ScenarioPreview.jsx), [Theme styles](../src/style.css)

### 7. Package

The README gives local prerequisites, run commands, and the fixture contract. Compose supplies PostgreSQL and a named volume, and Maven packages the backend. These are local run instructions. The one-command runner was verified from a fresh source copy with no installed frontend dependencies or build outputs. Public Git history and a contest release or hosted URL remain separate submission requirements. [Local instructions](../README.md), [Compose configuration](../compose.yaml), [Backend build](../backend/pom.xml)

### 8. Automate

Codex converted the main acceptance criteria into a reusable smoke script. It creates a synthetic local account, asserts the original and patched outcomes, saves and reruns the regression, and checks that a modern order produces no false fix verdict. An assertion failure exits nonzero. The check passed against the local stack for the legacy order, the saved regression rerun, and the modern control. There is no recorded CI run. [Smoke script](replay-smoke.mjs)

## Codex capability and model evidence

- **Conversation and iterative edits** fit scope and UI changes with direct builder feedback. The chat records the move from project exploration to production-like fixtures, the simulator, and team sharing.
- **Workspace editing and terminal builds** fit implementation across React, Spring Boot, and PostgreSQL. The linked code and repeatable commands are the durable outputs.
- **Browser interaction** fit checking control visibility and navigating the early replay UI. **Scripted HTTP assertions** fit precise behavior checks such as 500 versus 200, payment counts, and save and rerun behavior.
- **Model and reasoning effort.** Codex was used in the desktop chat. Exact model labels and effort settings for the historical implementation turns are not verified by the available record. Use session metadata or screenshots if available before claiming any model choice, switch, or effort level. The capability choices above are supported by observed work. They do not establish model configuration.

## Judge reproduction

Install the prerequisites in the [README](../README.md), then run this from the project root:

```sh
bash submission/run-demo.sh
```

The runner builds both apps, starts a fresh temporary database, and executes the HTTP smoke test through the frontend proxy. React and the smoke test share the [synthetic fixture](fixtures/legacy-checkout.json). The runner then shuts down the demo services. [Demo runner](run-demo.sh)

Observed from a fresh source copy:

```text
PASS legacy order: original 500 / 0 payments, patch 200 / 1 payment
PASS saved regression: rerun matches the original comparison
PASS modern control: both succeed and no fix is asserted
```

## Submission items to confirm

- Official workshop names for the six middle stages and any available model or effort evidence.
- Public GitHub URL with genuine commit history and an `AGENTS.md`. This workspace currently has no Git metadata, so the pack links to files.
- A live URL or runnable release published for judges.
