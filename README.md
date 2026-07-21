# Codex Provider Switcher

Windows-first Tauri 2 desktop app for safely switching Codex providers and models.

## Development

```powershell
npm install
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

The app reads `%USERPROFILE%\\.codex\\config.toml` by default. Set `CODEX_HOME` or use the path setting to override it.
