# ReGit

Pre-commit code intelligence and change blast-radius analysis engine.

---

## 1. System Architecture

```text
+-------------------------------------------------------------------------+
|                              INPUT LAYER                                |
|  - GitHub Repositories (Public / Private via OAuth or PAT)              |
|  - Ingestion via Blobless Sparse Checkout (filters node_modules, venv)  |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                           PARSING & EXTRACTION                          |
|  - Python AST Parser      : Classes, Functions, Fields, Flask/FastAPI   |
|  - TypeScript/JS Parser   : Components, Functions, Imports, Properties  |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                      CODE INTELLIGENCE GRAPH (NetworkX)                 |
|  - Nodes: Functions, Classes, Fields, APIs, Components, Tests           |
|  - Edges: calls, imports, references, queries                           |
+------------------+------------------+-----------------+-----------------+
                   |                  |                 |
                   v                  v                 v
+------------------+--+  +------------+----+  +---------+---------------+
|    IMPACT ENGINE    |  |  SAFETY ENGINE  |  |     JANITOR ENGINE      |
|  - Blast Radius     |  |  - 8 Rules      |  |  - Unused Imports       |
|  - Direct Callers   |  |  - Contract Def |  |  - Dead Code Detection  |
|  - Transitive Deps  |  |  - Security/Auth|  |  - Duplicate Helpers    |
|  - Affected Tests   |  |  - DB Migration |  |  - Unused Dependencies  |
+------------------+--+  +------------+----+  +---------+---------------+
                   |                  |                 |
                   +------------------+-----------------+
                                      |
                                      v
+-------------------------------------------------------------------------+
|                            AI EXPLAINER LAYER                           |
|  - Offline Mode (Default) : Deterministic root-cause & checklists       |
|  - LLM Mode (Optional)    : OpenAI (gpt-4o-mini) tailored remediation   |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                          DELIVERY & EXECUTION                           |
|  - Next.js 16 Web Dashboard (Interactive Graph, Findings, Previews)     |
|  - Direct GitHub Commit Engine (Pushes approved fixes back to branch)   |
+-------------------------------------------------------------------------+
```

---

## 2. Core Problem and Solution

| Challenge in Large Codebases | How ReGit Solves It |
| --- | --- |
| **Silent Contract Drift** | Renaming `User.email` breaks unmapped consumers. ReGit traverses the graph and flags every affected caller across backend, frontend, and tests. |
| **Hidden Positional Breaks** | Function signatures change; callers still supply old parameters. ReGit detects signature-caller mismatch across all modules. |
| **Unprotected Endpoints** | Sensitive or administrative routes get added without auth guards. ReGit runs deterministic checks for missing authorization decorators. |
| **Destructive Migrations** | DB migrations drop columns while active code still issues queries against them. ReGit detects references before the migration is applied. |
| **Technical Debt Creep** | Unused packages, orphaned functions, and dead imports accumulate. ReGit identifies them with unified diff previews ready for review. |

---

## 3. Component Pipeline

### Pipeline Flow

```text
[ Git Clone / Demo ] -> [ AST Parse ] -> [ Graph Build ] -> [ Parallel Evaluation ]
                                                                   |
                               +-----------------------------------+-----------------------------------+
                               |                                   |                                   |
                               v                                   v                                   v
                      [ Impact Traversal ]               [ Safety Rule Checks ]               [ Janitor Scans ]
                      Depth 0: Target                    - Stale references                   - Unused imports
                      Depth 1: Direct callers            - Signature drift                    - Dead functions
                      Depth 2: Transitive users          - Missing auth guards                - Duplicate utils
                                                         - Exposed secrets                    - Unused packages
                                                         - Risky migrations
```

### Depth-Based Impact Model
- **Depth 0 (Target)**: The modified symbol, function, or model attribute.
- **Depth 1 (Direct Impact)**: Immediate callers, importing files, and direct route handlers.
- **Depth 2 (Transitive Impact)**: Downstream consumers, UI views rendering the data, and integration tests.

---

## 4. Deterministic Safety Rules

ReGit does not guess with probabilistic checks. It evaluates 8 deterministic rules anchored in code evidence:

| Rule ID | Severity | Failure Condition | Suggested Remediation |
| --- | --- | --- | --- |
| `removed_field_reference` | High | Model field renamed, but old field name is still dereferenced. | Update callers to new field name or provide an alias property. |
| `function_signature_change` | High | Function parameter count/signature changed while call-sites use old contract. | Audit call-sites or use keyword arguments with defaults. |
| `api_contract_change` | Medium | Frontend component expects a JSON key omitted by backend response. | Update TypeScript interface and frontend data binding. |
| `auth_missing` | High | Privileged route (`/admin` or mutating endpoint) lacks auth dependency. | Add session or role-based authorization guard. |
| `sensitive_exposure` | High | Credential field (`password_hash`, tokens) serialized in response payload. | Exclude sensitive fields from serialization schemas. |
| `null_access` | Medium | Database query record dereferenced without existence guard. | Add explicit null check before accessing attributes. |
| `risky_migration` | High | Migration drops a database column still referenced in application code. | Deploy code removing column usage before dropping it in DB. |
| `missing_test` | Medium | Security-critical or auth logic modified with zero test assertions. | Add unit or integration test covering the new code paths. |

---

## 5. Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| **Frontend** | Next.js 16, React 19, TypeScript | App Router, interactive visual graph, diff review |
| **Styling** | Tailwind CSS v4, Lucide Icons | Responsive dark-mode dashboard interface |
| **Backend** | Python 3.11+, Flask 3, Gunicorn | REST API, async scan queue, git worker pool |
| **Graph** | NetworkX (DiGraph) | In-memory directed graph construction & traversal |
| **Database** | PostgreSQL, Drizzle ORM, psycopg2 | Relational schema, persistent entities, pool manager |
| **Parsers** | Python `ast`, Custom JS/TS Lexer | Source-to-entity AST and relationship extraction |
| **AI Layer** | Built-in Heuristics / OpenAI API | Deterministic offline explainer + optional LLM mode |

---

## 6. Directory Map

```text
regit/
|-- backend/
|   |-- app/
|   |   |-- ai/           # Offline heuristic and OpenAI explanation providers
|   |   |-- analysis/     # AST parsers, NetworkX graph engine, background scanner
|   |   |-- api/          # Blueprints: auth, repos, impact, findings, janitor, github
|   |   |-- db/           # PostgreSQL pool manager, connection helpers, seed data
|   |   |-- github/       # GitHub API client, URL canonicalization, commit handler
|   |   |-- janitor/      # Cleanup analyzers for imports, dead code, and packages
|   |   \-- rules/        # 8 deterministic safety rule implementations
|   |-- tests/            # Automated test suite (138+ pytest test cases)
|   \-- run.py            # Backend entry point
|-- src/
|   |-- app/
|   |   |-- dashboard/    # Overview, impact analyzer, safety audit, code janitor
|   |   |-- login/        # Authentication pages
|   |   \-- page.tsx      # Marketing landing page
|   |-- components/       # UI library: shell, graph canvas, modals, pills
|   |-- db/               # Drizzle ORM schema and migrations
|   \-- lib/              # Client API wrappers and utility functions
|-- scripts/
|   |-- dev-api.js        # Port-safe Flask supervisor
|   \-- dev-web.js        # Port-safe Next.js supervisor
\-- render.yaml           # Production backend deployment blueprint
```

---

## 7. Quick Setup

### Step 1: Clone and Configure Environment

```bash
git clone https://github.com/being-souL1230/ReGit.git
cd ReGit
cp .env.example .env
```

Set required variables in `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/regit"
SECRET_KEY="generate-with-python-command-below"
```
Generate `SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Step 2: Install Dependencies and Push Schema

```bash
# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Frontend
npm install

# Push database tables
npm run db:push
```

### Step 3: Run the Platform

```bash
# Run both frontend and backend concurrently:
npm run dev
```

- Web Interface: `http://localhost:3000`
- Backend API: `http://localhost:5000`

### Optional: Load Demo Repository

Seed pre-configured demo repository containing known safety findings:
```bash
curl -X POST http://localhost:5000/api/seed
```
Demo Credentials:
- Email: `demo@regit.dev`
- Password: `regit-demo-123`

---

## 8. Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | None | PostgreSQL database connection string. |
| `SECRET_KEY` | Production | Auto-generated in dev | Used to sign session cookies. |
| `PORT` | No | `5000` | Backend API port. |
| `FLASK_DEBUG` | No | `true` | Enables Flask reloader and debug output. |
| `GITHUB_TOKEN` | No | `""` | Personal Access Token for GitHub imports/commits. |
| `GITHUB_CLIENT_ID` | No | `""` | OAuth client ID for GitHub web login. |
| `GITHUB_CLIENT_SECRET`| No | `""` | OAuth client secret for GitHub web login. |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Allowed browser origins for credentials. |
| `OPENAI_API_KEY` | No | `""` | Optional key for AI explanations (offline if empty).|

---

## 9. REST API Reference

```text
AUTH             POST   /api/auth/register          Register account
                 POST   /api/auth/login             Log in / set session cookie
                 POST   /api/auth/logout            Clear session
                 GET    /api/auth/me                Fetch active user

REPOSITORIES     GET    /api/repositories           List user repositories
                 POST   /api/repositories           Connect repository URL
                 GET    /api/repositories/:id       Get metadata and scan status
                 DELETE /api/repositories/:id       Delete repository
                 GET    /api/repositories/:id/graph Get full graph nodes & edges
                 POST   /api/repositories/:id/commit Push file changes to GitHub

IMPACT & SAFETY  POST   /api/repositories/:id/analyze Trigger re-scan
                 POST   /api/repositories/:id/impact  Calculate blast radius
                 GET    /api/repositories/:id/findings List safety findings
                 POST   /api/findings/:id/explain     Generate remediation plan

JANITOR          GET    /api/repositories/:id/cleanup List cleanup candidates
                 POST   /api/cleanup/:id/preview      Get unified diff preview
                 PATCH  /api/cleanup/:id              Update item status

GITHUB           GET    /api/github/repos           List repositories from GitHub
                 POST   /api/github/import-repos    Import batch of repos
                 GET    /api/github/login           Start GitHub OAuth flow
```

---

## 10. Verification Commands

```bash
# Run backend test suite (138 tests):
pytest

# Run TypeScript type check:
npm run typecheck

# Run ESLint:
npm run lint
```
