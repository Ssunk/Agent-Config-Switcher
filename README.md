# Codex Provider Switcher

Windows-first Tauri 2 desktop app for safely switching Codex and Claude Code configurations.

## Development

```powershell
npm install
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

The app reads `%USERPROFILE%\\.codex\\config.toml` for Codex and `%USERPROFILE%\\.claude\\settings.json` for Claude Code by default. Set `CODEX_HOME` or `CODEX_CONFIG_PATH` to override the Codex path; `CLAUDE_CONFIG_PATH` overrides the Claude Code path.
