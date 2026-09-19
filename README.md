# ReGit

ReGit is a code intelligence and pre-commit safety platform designed for modern engineering teams. It connects to your GitHub repositories, parses code across languages, constructs an interconnected dependency graph, and analyzes the exact ripple effects of your changes before you commit or deploy them.

---

## The Problem: Why ReGit?

Refactoring software in large codebases is fraught with invisible risks. A change in one layer often ripples outward and breaks downstream consumers in non-obvious ways:

- A database column rename (such as changing `email` to `email_address`) leaves stale references in background workers, serializers, and frontend components that silently return undefined values or crash with runtime attribute errors.
- A modified function signature continues to work syntactically for callers passing positional arguments, but silently binds values to wrong parameters.
- API endpoints drop response fields that frontend UI components rely on, leading to blank screens in production.
- Database migrations execute column drops before all application services have deployed updated code, causing zero-downtime deploy failures.
- Privileged endpoints are created without required authorization decorators or session guards.
- Codebases accumulate technical debt, including dead functions, abandoned utilities, unused imports, and unreferenced packages.

Standard linters only analyze isolated files or syntax boundaries. ReGit treats your entire repository as a living, interconnected system, calculating the true blast radius of every change before it reaches production.

---

## How ReGit Works: The Analysis Pipeline

ReGit follows a multi-stage pipeline to inspect, index, and analyze repositories:

1. **Repository Ingestion and Shallow Clone**
   When a repository is imported, ReGit performs a shallow, single-branch clone with a blobless sparse checkout (`--filter=blob:none --sparse`). Heavy and vendored directories (such as `node_modules`, `venv`, `dist`, `.next`, and `build`) are excluded from download, enabling fast clones while minimizing disk usage.

2. **Multi-Language AST Parsing**
   ReGit parses source code files using language-specific parsers:
   - **Python**: Uses Python's native `ast` module to extract classes, functions, SQLAlchemy model fields, decorator-based API routes (Flask, FastAPI), and call hierarchies.
   - **TypeScript and JavaScript**: Extracts components, functions, imports, exported interfaces, and field references.

3. **Code Intelligence Graph Construction**
   Extracted entities and relationships are modeled inside a directed graph using NetworkX. Nodes represent code artifacts (Functions, Classes, Fields, APIs, Components, Tests), and edges capture relationships (imports, calls, references, queries).

4. **Blast Radius and Impact Traversal**
   When querying a symbol (for example, `User.email`), ReGit traverses the graph outward up to two hops:
   - **Depth 0 (Target)**: The symbol itself.
   - **Depth 1 (Direct Callers)**: Functions, routes, and components directly calling or referencing the symbol.
   - **Depth 2 (Transitive Consumers)**: Downstream consumers, UI views, and secondary callers affected by the ripple effect.
   The resulting impact summary aggregates affected files, APIs, frontend components, and tests.

5. **Deterministic Safety Rule Engine**
   ReGit runs 8 deterministic safety rules against repository files and relationships to catch critical regressions. Unlike pure probabilistic AI checkers, these rules are deterministic, reproducible, and anchored in concrete file and line evidence.

6. **AI Safety Explainer Layer**
   Each finding can be inspected for automated root-cause analysis and remediation:
   - **Local Heuristic Mode (Default)**: Generates structured, deterministic markdown explanations, impact summaries, and review checklists offline without requiring an external API key.
   - **LLM Mode (Optional)**: Connects to OpenAI (or compatible API endpoints) to generate tailored migration plans and contextual remediation guidance.

7. **Code Janitor Engine**
   Scans the repository for technical debt and dead code:
   - Unused imports across Python and TypeScript files.
   - Dead functions that have zero callers across the codebase and are marked deprecated or legacy.
   - Duplicate utility functions defined across multiple paths.
   - Unused packages in `package.json` or `requirements.txt`.
   Each cleanup item produces a unified diff preview that developers can review and approve before applying.

8. **Direct GitHub Commit**
   Users can apply fixes or file updates and commit them directly back to the target branch on GitHub using the GitHub REST API, without leaving the dashboard.

---

## Core Features

### 1. Change Impact Analyzer
- Enter any symbol, function, or model attribute to calculate its blast radius.
- View an interactive node graph showing direct and transitive dependencies.
- Inspect categorized breakdowns of affected files, API routes, UI components, and test files.
- Copy pre-generated AI prompts containing the exact blast radius context for use in coding assistants.

### 2. Pre-Commit Safety Engine
Deterministic analysis evaluating 8 critical safety rules:
- **Stale Field Reference**: Detects renamed model columns where older consumers still dereference old attribute names.
- **Function Signature Contract Drift**: Identifies functions whose signatures changed while callers still supply arguments under old contracts.
- **Frontend API Contract Mismatch**: Flags frontend components expecting JSON fields that backend responses no longer provide.
- **Missing Privileged Auth Guard**: Detects admin or mutating endpoints missing authentication middleware or dependencies.
- **Sensitive Credential Leak**: Identifies responses or serialization methods exposing sensitive attributes like `password_hash`.
- **Null Pointer Dereference**: Detects database query lookups dereferenced without existence guards.
- **Risky Column Drop Migration**: Flags database migrations dropping columns that are still actively referenced in application code.
- **Missing Test Coverage**: Flags modified authentication and security-critical paths that lack matching automated tests.

### 3. AI Safety Assistant
- Generates structured remediation reports covering: What happened, Why it matters, Blast radius, Suggested fix, and Review checklist.
- Works offline out-of-the-box using the built-in deterministic rule explainer.
- Can be powered by OpenAI (`gpt-4o-mini` or custom models) by providing `OPENAI_API_KEY`.

### 4. Code Janitor (Refactoring Hygiene)
- Unused import detection for Python and JavaScript/TypeScript.
- Dead function detection with zero callers across the dependency graph.
- Duplicate utility detection across disparate modules.
- Unused dependency scanning for `package.json` and `requirements.txt`.
- Side-by-side diff previews with approval workflow.

### 5. GitHub Integration
- Sign in with GitHub OAuth or connect using a Personal Access Token.
- Browse public and private repositories and import them into ReGit.
- Asynchronous background repository scanning with automatic recovery.
- Commit approved file changes directly back to your GitHub repository branches.

---

## Technical Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend** | Python 3.11+, Flask 3, Flask-CORS, Gunicorn |
| **Graph Engine** | NetworkX (directed graph analysis and traversal) |
| **Database** | PostgreSQL, Drizzle ORM (schema definitions), psycopg2-binary (threaded connection pooling) |
| **Parsing** | Python AST visitor, TypeScript and JavaScript regex/token parser |
| **AI Layer** | OpenAI Chat Completions API (optional) with local heuristic fallback |

---

## Project Structure

```text
regit/
|-- backend/
|   |-- app/
|   |   |-- __init__.py           # Flask application factory and blueprint registration
|   |   |-- config.py             # Environment configuration and validation
|   |   |-- ai/
|   |   |   \-- provider.py       # Deterministic and LLM-powered explanation provider
|   |   |-- analysis/
|   |   |   |-- graph.py          # NetworkX code intelligence graph and blast radius logic
|   |   |   |-- parsers.py        # Python AST and TypeScript/JavaScript source parsers
|   |   |   |-- scanner.py        # Directory walker and file language detector
|   |   |   \-- service.py        # Asynchronous scan queue, clone engine, and worker pool
|   |   |-- api/
|   |   |   |-- analysis.py       # Scan trigger endpoints
|   |   |   |-- auth.py           # User authentication and session management
|   |   |   |-- findings.py       # Safety findings retrieval, status updates, and explanations
|   |   |   |-- github.py         # GitHub OAuth, repository sync, and token management
|   |   |   |-- guards.py         # Ownership checks and authorization guards
|   |   |   |-- health.py         # Service health check endpoint
|   |   |   |-- impact.py         # Blast radius calculation and symbol suggestions
|   |   |   |-- janitor.py        # Code cleanup item endpoints and diff previews
|   |   |   |-- repositories.py   # Repository CRUD, graph data, file viewer, and commit API
|   |   |   |-- seed.py           # Demo repository seeder
|   |   |   \-- serializers.py    # Database model to JSON serialization helpers
|   |   |-- db/
|   |   |   |-- connection.py     # Threaded PostgreSQL connection pool and query helpers
|   |   |   \-- seed_data.py      # Built-in demo repository source files and fixtures
|   |   |-- github/
|   |   |   \-- client.py         # GitHub API client, URL canonicalization, and validation
|   |   |-- janitor/
|   |   |   \-- analyzer.py       # Detection logic for dead code, unused imports, and unused deps
|   |   \-- rules/
|   |       |-- checks.py         # 8 deterministic safety rule implementations
|   |       \-- engine.py         # Rule execution orchestrator
|   |-- tests/                    # Pytest test suite (138+ automated unit and integration tests)
|   |-- requirements.txt          # Python dependencies
|   \-- run.py                    # Flask development server entry point
|-- src/
|   |-- app/
|   |   |-- page.tsx              # Public landing page with live interactive visuals
|   |   |-- layout.tsx            # Root layout and theme wrapper
|   |   |-- globals.css           # Custom styling and layout utility definitions
|   |   |-- login/                # Email/password and GitHub login page
|   |   |-- register/             # User registration page
|   |   \-- dashboard/
|   |       |-- page.tsx          # Main dashboard overview and activity stream
|   |       |-- impact/page.tsx   # Change impact analyzer with graph visualization
|   |       |-- safety/page.tsx   # Pre-commit safety rule findings and AI explainer
|   |       |-- janitor/page.tsx  # Code janitor technical debt and cleanup queue
|   |       \-- repositories/     # Connected repository list and import drawer
|   |-- components/
|   |   |-- shell.tsx             # Application sidebar, navigation, and active repo provider
|   |   \-- ui.tsx                # Reusable UI component library (modals, pills, badges)
|   |-- db/
|   |   |-- schema.ts             # Drizzle ORM schema for PostgreSQL
|   |   \-- index.ts              # Drizzle ORM client initialization
|   \-- lib/                      # Client-side API helpers and utility functions
|-- scripts/
|   |-- dev-api.js                # Port-safe development process supervisor for Flask
|   \-- dev-web.js                # Port-safe development process supervisor for Next.js
|-- drizzle.config.ts             # Drizzle Kit configuration
|-- package.json                  # Node.js dependencies and run scripts
|-- render.yaml                   # Backend Render deployment configuration
\-- tsconfig.json                 # TypeScript compiler configuration
```

---

## Prerequisites

Ensure you have the following installed on your machine:

- **Node.js**: Version 18.18 or higher (Node 20+ recommended)
- **Python**: Version 3.11 or higher
- **PostgreSQL**: Version 14 or higher (or a cloud provider such as Neon)
- **Git**: Version 2.25 or higher

---

## Step-by-Step Setup and Installation

### 1. Clone the Repository

```bash
git clone https://github.com/being-souL1230/ReGit.git
cd ReGit
```

### 2. Configure Environment Variables

Copy the template environment file:

```bash
cp .env.example .env
```

Open `.env` and set the required variables:

- `DATABASE_URL`: PostgreSQL connection string (for example, `postgresql://postgres:password@localhost:5432/regit`).
- `SECRET_KEY`: Random string for session signature. Generate one using:
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- Optional: Add `GITHUB_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `OPENAI_API_KEY` if using GitHub OAuth or LLM features.

### 3. Backend Python Setup

Create and activate a virtual environment, then install backend dependencies:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 4. Frontend Node Setup

Install Node.js packages:

```bash
npm install
```

### 5. Apply Database Schema

Push the Drizzle ORM schema into your PostgreSQL database:

```bash
npm run db:push
```

### 6. Seed Demo Repository (Optional)

You can seed the database with the pre-built `regit-demo` repository containing intentionally engineered contract breaks and dead code to test the platform immediately:

```bash
# Start backend first (see below) or call the seed endpoint once running:
curl -X POST http://localhost:5000/api/seed
```

Demo login credentials created by the seed command:
- Email: `demo@regit.dev`
- Password: `regit-demo-123`

---

## Running the Application

### Option A: Run Everything Concurrently (Recommended)

Run both the Next.js frontend and Flask backend using a single command:

```bash
npm run dev
```

This runs `scripts/dev-api.js` and `scripts/dev-web.js`. These scripts check whether ports 5000 and 3000 are already running healthy instances, avoiding port collision crashes.

- Frontend runs at: `http://localhost:3000`
- Backend runs at: `http://localhost:5000`

### Option B: Run Services Individually

If you prefer separate terminal tabs:

**Terminal 1 (Backend):**
```bash
source venv/bin/activate
python3 backend/run.py
# Or use the port supervisor:
npm run dev:api
```

**Terminal 2 (Frontend):**
```bash
npm run dev:web
# Or directly via Next.js:
npx next dev -p 3000
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | None | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/regit`). |
| `SECRET_KEY` | Production | Dev fallback | Secret string used to sign session cookies. Required when `FLASK_DEBUG=false`. |
| `PORT` | No | `5000` | Port for the Flask backend HTTP server. |
| `FLASK_DEBUG` | No | `true` | Enables Flask debug mode and automatic code reloading. |
| `GITHUB_TOKEN` | No | `""` | GitHub Personal Access Token (with `repo`, `read:user` scopes) used as default fallback. |
| `GITHUB_CLIENT_ID` | No | `""` | GitHub OAuth application client ID for web sign-in. |
| `GITHUB_CLIENT_SECRET` | No | `""` | GitHub OAuth application client secret. |
| `PUBLIC_APP_URL` | No | `""` | Base URL used to construct OAuth redirect URIs (e.g. `https://regit.example.com`). |
| `GITHUB_REDIRECT_URI` | No | `""` | Full OAuth redirect URI override. |
| `SESSION_DAYS` | No | `30` | Session lifetime in days. |
| `COOKIE_SECURE` | No | `false` | Sets the `Secure` flag on session cookies. Must be `true` when behind HTTPS. |
| `CORS_ORIGINS` | No | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated list of browser origins allowed to make credentialed requests. |
| `OPENAI_API_KEY` | No | `""` | OpenAI API key for LLM explanations. If empty, local heuristic mode is used. |
| `AI_BASE_URL` | No | `https://api.openai.com/v1` | Custom endpoint for OpenAI-compatible LLM providers. |
| `AI_MODEL` | No | `gpt-4o-mini` | Model identifier used for generating safety finding explanations. |

---

## Deterministic Safety Rules Reference

ReGit evaluates code changes against 8 specific safety rules:

| Rule ID | Severity | Description | Detection Mechanism |
| --- | --- | --- | --- |
| `removed_field_reference` | High | Model field renamed or removed, but callers still dereference the old attribute name. | Scans Python and TypeScript relationship edges for references to attributes that no longer match the active model definition. |
| `function_signature_change` | High | Function parameter contract changed while existing callers still pass old argument signatures. | Inspects function definitions and compares call-site argument counts across all referencing source files. |
| `api_contract_change` | Medium | Frontend component expects a response property that backend APIs no longer return. | Maps frontend component JSON property dereferences against backend route return dictionaries and schemas. |
| `auth_missing` | High | Privileged or admin endpoint exposed without authorization middleware or session guards. | Scans API route decorators for `/admin` or mutating methods lacking `Depends()`, `current_user`, or role guards. |
| `sensitive_exposure` | High | Sensitive credentials (e.g. `password_hash`) included in serialized response payloads. | Checks serialization functions, DTOs, and API return statements for explicit inclusion of secret fields. |
| `null_access` | Medium | Database record lookup dereferenced without checking for `None`. | Detects `.query.get()` patterns followed by immediate attribute dereferences without preceding null checks. |
| `risky_migration` | High | Migration drops a database column while active application code still queries it. | Scans SQL and Alembic/migration scripts for `drop_column` operations targeting columns still found in application queries. |
| `missing_test` | Medium | Modified authentication or authorization logic lacks automated test assertions. | Cross-references changes in security-critical modules against test suite contents to verify test coverage existence. |

---

## Code Janitor Cleanup Types

The Code Janitor component identifies technical debt and generates reviewable diffs:

| Item Type | Confidence | Description | Action |
| --- | --- | --- | --- |
| `unused_import` | High | Imported module or symbol is never referenced in the file content. | Removes the unneeded import statement line. |
| `dead_code` | High | Function has 0 callers across the repository graph and is marked deprecated or legacy. | Safely removes the unused function implementation. |
| `duplicate_utility` | Medium | Identical or near-identical helper functions declared across multiple separate files. | Recommends consolidation into a shared utility file. |
| `unused_dependency` | High | Package listed in `package.json` or `requirements.txt` is never imported in codebase files. | Removes package entry from dependency manifest. |

---

## API Endpoints Reference

### Authentication
- `POST /api/auth/register`: Create a new user account with email and password.
- `POST /api/auth/login`: Authenticate with email/password and establish session cookie.
- `POST /api/auth/logout`: Invalidate session and clear authentication cookie.
- `GET /api/auth/me`: Retrieve current authenticated user profile.

### Repositories
- `GET /api/repositories`: List repositories owned by the current user (or public demo for guests).
- `POST /api/repositories`: Connect a new GitHub repository URL and trigger initial scan.
- `GET /api/repositories/<id>`: Get repository metadata and scan status.
- `PATCH /api/repositories/<id>`: Update repository details (name, branch, description).
- `DELETE /api/repositories/<id>`: Remove a repository and all associated analysis records.
- `GET /api/repositories/<id>/overview`: High-level statistics, language stats, and recent findings.
- `GET /api/repositories/<id>/graph`: Graph nodes and edges for visualization.
- `GET /api/repositories/<id>/files`: List indexed files with lines of code and status.
- `GET /api/repositories/<id>/files/<file_id>`: Fetch raw content of a specific file.
- `PUT /api/repositories/<id>/files/<file_id>`: Update file content locally.
- `POST /api/repositories/<id>/commit`: Commit updated file content directly to GitHub branch.

### Analysis and Impact
- `POST /api/repositories/<id>/analyze`: Trigger background re-scan and graph re-indexing.
- `GET /api/repositories/<id>/impact`: Get suggested symbols for impact analysis.
- `POST /api/repositories/<id>/impact`: Compute blast radius and return affected graph nodes for a symbol.

### Safety Findings
- `GET /api/repositories/<id>/findings`: Retrieve all detected safety findings for a repository.
- `PATCH /api/findings/<id>`: Update finding status (`open`, `resolved`, `ignored`).
- `POST /api/findings/<id>/explain`: Generate or fetch cached AI explanation and remediation checklist.

### Code Janitor
- `GET /api/repositories/<id>/cleanup`: List detected cleanup items for a repository.
- `PATCH /api/cleanup/<id>`: Update cleanup item status (`pending`, `applied`, `ignored`).
- `DELETE /api/cleanup/<id>`: Delete a cleanup item.
- `POST /api/cleanup/<id>/preview`: Fetch the unified diff preview for a cleanup action.

### GitHub Integration
- `GET /api/github/status`: Check whether the user has linked a GitHub account or token.
- `POST /api/github/connect`: Store and validate a personal access token.
- `POST /api/github/disconnect`: Remove stored GitHub access credentials.
- `GET /api/github/repos`: List repositories accessible via the connected GitHub token.
- `POST /api/github/import`: Import a single repository by owner and name.
- `POST /api/github/import-repos`: Batch import selected repositories.
- `GET /api/github/login`: Initiate GitHub OAuth authorization flow.
- `GET /api/github/callback`: Handle GitHub OAuth redirect and issue session.

### System
- `GET /api/health`: Health check endpoint returning backend status.
- `POST /api/seed`: Seeds the database with the pre-built `regit-demo` repository.

---

## Testing and Verification

### Backend Tests

ReGit includes an automated Pytest test suite covering SSRF protection, branch name sanitization, ownership authorization guards, CORS security, AST parsers, safety rules, and scan queue mechanics:

```bash
# Run all backend tests
pytest

# Run tests with verbose output
pytest -v

# Run a specific test suite
pytest backend/tests/test_rules.py
pytest backend/tests/test_parsers.py
pytest backend/tests/test_ssrf.py
```

### Frontend Code Quality

Validate TypeScript types and ESLint checks:

```bash
# Typecheck TypeScript files
npm run typecheck

# Run ESLint
npm run lint
```

---

## Production Deployment

### Backend Deployment (Render)

The project includes a ready-to-use `render.yaml` specification:

1. Push your repository to GitHub.
2. In Render, create a new Blueprint using your repository.
3. Configure the required environment variables:
   - `DATABASE_URL`: Set to your production PostgreSQL connection string (such as Neon).
   - `SECRET_KEY`: Generate a secure random 48-character key.
   - `CORS_ORIGINS`: Set to your production frontend domain (e.g. `https://regit.vercel.app`).
   - `COOKIE_SECURE`: Set to `true`.
   - `FLASK_DEBUG`: Set to `false`.
4. Build command: `pip install -r backend/requirements.txt`
5. Start command: `gunicorn --bind 0.0.0.0:$PORT backend.run:app`

### Frontend Deployment (Vercel)

1. Import the repository in Vercel.
2. Set Framework Preset to **Next.js**.
3. Add environment variables:
   - `DATABASE_URL`: PostgreSQL connection string.
   - `PORT`: Optional backend URL configuration if proxying API requests.
4. Deploy the project.

---

## Security and Safe Handling

- **SSRF Defense**: The scanner validates and canonicalizes all repository URLs through `canonical_clone_url()`. Only legitimate `github.com` URLs with alphanumeric characters, hyphens, underscores, and dots are accepted. Arbitrary hosts, private network IPs, or local protocol wrappers are rejected before git commands are spawned.
- **Git Option Injection Prevention**: Branch names and file paths undergo strict validation (`validate_branch_name` and `validate_file_path`) to prevent CLI flag injection (e.g., arguments starting with `--` or containing shell metacharacters).
- **Hung Process Safeguards**: Background git clones execute in isolated process groups with stdin closed (`GIT_TERMINAL_PROMPT=0`). If a clone exceeds the timeout threshold (120 seconds), the entire process group is terminated to ensure workers are never blocked.
- **Authorization Guards**: Endpoints enforce ownership validation via `get_owned_repository()` and `authorize_item()`. Users cannot view, modify, or commit against repositories belonging to other accounts.
- **Local-First Privacy**: Code parsing and safety checks run entirely on your own server. Source code is never sent to external AI providers unless you explicitly configure `OPENAI_API_KEY` and click "Explain with AI".
