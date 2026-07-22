# AGENTS.md

## Project Overview

Codex Provider Switcher is a Windows-first Tauri 2 desktop application for managing and applying Codex configuration profiles. The UI is written in framework-free TypeScript and CSS; Rust owns filesystem access, TOML/JSON parsing, profile persistence, atomic replacement, and the system tray.

The interface is Chinese. Keep new user-facing copy consistent with the surrounding Chinese text, while code identifiers and developer documentation should remain in English.

## Repository Map

- `ui/main.ts`: all frontend state, rendering, event handling, and typed wrappers around Tauri `invoke` calls.
- `ui/style.css`: the complete visual system and responsive layout.
- `index.html`: Vite entry document.
- `src-tauri/src/lib.rs`: Tauri commands and all configuration/profile persistence logic.
- `src-tauri/src/main.rs`: application startup, command registration, window behavior, and system tray behavior.
- `src-tauri/tauri.conf.json`: Tauri build, window, security, and NSIS bundle configuration.
- `src-tauri/icons/`: application and tray assets.

## Development Commands

Run commands from the repository root unless noted otherwise.

```powershell
npm install
npm run dev
npx tauri dev
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

- `npm run dev` starts only the Vite frontend. Tauri calls intentionally fail in a normal browser with `请在 Tauri 应用中运行`.
- `npx tauri dev` is the normal end-to-end development command and uses Vite through `beforeDevCommand`.
- `npm run build` performs the strict TypeScript check and Vite production build.
- Run `npx tauri build` only when an installer/bundle is required; it is slower and Windows packaging prerequisites apply.

## Architecture And Contracts

- The frontend replaces `#app` contents with template strings and then rebinds DOM listeners. Preserve this render/rebind model unless a broader frontend rewrite is explicitly requested.
- Escape all file-derived or user-derived strings inserted into HTML with `esc`. Do not interpolate untrusted values directly into markup.
- Frontend Tauri argument names use camelCase (for example `profileId`); Rust command parameters use snake_case (for example `profile_id`). Keep both sides synchronized when changing a command.
- Every command exposed to the UI must be registered in `tauri::generate_handler!` in `src-tauri/src/main.rs`.
- Rust command errors cross the IPC boundary as `String` and are displayed to users. Return actionable Chinese messages and retain useful path or parser context.
- Keep filesystem and parsing behavior in Rust. The frontend should operate on typed DTOs such as `Profile`, `Config`, and `Field`, not read Codex files directly.

## Data And Safety Invariants

- Configuration path precedence is `CODEX_CONFIG_PATH`, then `CODEX_HOME/config.toml`, then `%USERPROFILE%/.codex/config.toml`.
- Profiles live beside the active configuration in `config-profiles/`; metadata is stored in `profiles.json`, and each profile body is a UUID-named `.toml` file.
- `auth.json` lives beside the active `config.toml`.
- Validate TOML or JSON before saving or applying it. Preserve TOML formatting/comments through `toml_edit` when updating fields.
- Continue using `write_atomic` for user configuration and profile contents. Do not replace it with direct writes to `config.toml` or `auth.json`.
- Treat profile filenames as untrusted metadata. Preserve `safe_profile_path` validation and never accept separators or arbitrary paths.
- Applying a profile must leave at most one profile with `last_applied` set. A currently applied profile must not be deletable.
- Avoid tests that touch the user's real Codex directory. Isolate filesystem tests with `tempfile` and explicit environment/path overrides, and restore process environment changes after each test.

## Change Guidelines

- Follow the existing dependency-light design. Add a frontend framework or a Rust crate only when it removes concrete complexity that existing platform APIs cannot handle cleanly.
- Keep changes scoped. `ui/main.ts` and `src-tauri/src/lib.rs` are currently compact but central; extract modules only when a change creates a clear ownership boundary.
- Preserve the Windows-first behavior in `main.rs`: closing hides the window to the tray, tray actions restore or exit, and `open_config_directory` uses Explorer. Guard platform-specific additions with `cfg` where appropriate.
- Maintain strict TypeScript types. Avoid `any`; update the frontend DTOs whenever serialized Rust structures change.
- Use `rustfmt` for Rust edits and retain idiomatic error propagation rather than introducing panics in command paths.
- Do not edit generated output (`dist/`, `target/`) or dependency lockfiles unless the associated dependency set actually changes.

## Verification

Use the smallest relevant checks while iterating, then run the full baseline before handing off a behavior change:

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

Also run Clippy for Rust logic changes. For UI or IPC workflow changes, exercise the feature with `npx tauri dev`; browser-only testing cannot validate Tauri commands, filesystem behavior, tray behavior, or native window lifecycle.

Add or update Rust unit tests for parsing, path validation, profile state transitions, and persistence logic. There is no frontend test runner currently, so describe any manual desktop checks performed and pay particular attention to save, save-and-apply, delete protection, `auth.json`, error toasts, and window/tray behavior.
