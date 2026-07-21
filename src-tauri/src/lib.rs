pub mod commands {
    use chrono::Utc;
    use serde::{Deserialize, Serialize};
    use std::{fs, io, path::{Path, PathBuf}};
    use toml_edit::DocumentMut;
    use uuid::Uuid;
    #[derive(Clone, Serialize, Deserialize)]
    pub struct TomlProfile {
        pub id: String,
        pub name: String,
        pub file_name: String,
        pub created_at: String,
        pub updated_at: String,
        pub last_applied: Option<String>,
    }

    #[derive(Serialize)]
    pub struct ConfigInfo {
        pub path: String,
        pub content: String,
        pub model: Option<String>,
        pub provider: Option<String>,
    }

    #[derive(Serialize)]
    pub struct ApplyResult { pub applied_path: String }

    #[derive(Clone, Serialize, Deserialize)]
    pub struct TomlField { pub path: Vec<String>, pub section: String, pub key: String, pub kind: String, pub value: String }


    fn config_path() -> PathBuf {
        if let Ok(path) = std::env::var("CODEX_CONFIG_PATH") { return PathBuf::from(path); }
        if let Ok(home) = std::env::var("CODEX_HOME") { return PathBuf::from(home).join("config.toml"); }
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".codex").join("config.toml")
    }

    fn profiles_dir() -> PathBuf { config_path().parent().unwrap_or(Path::new(".")).join("config-profiles") }
    fn index_path() -> PathBuf { profiles_dir().join("profiles.json") }
    fn err(e: impl std::fmt::Display) -> String { e.to_string() }
    fn validate_toml(content: &str) -> Result<DocumentMut, String> {
        content.parse::<DocumentMut>().map_err(|e| format!("TOML 格式错误: {e}"))
    }
    fn read_index() -> Result<Vec<TomlProfile>, String> {
        if !index_path().exists() { return Ok(Vec::new()); }
        serde_json::from_str(&fs::read_to_string(index_path()).map_err(err)?).map_err(err)
    }
    fn write_index(items: &[TomlProfile]) -> Result<(), String> {
        fs::create_dir_all(profiles_dir()).map_err(err)?;
        fs::write(index_path(), serde_json::to_vec_pretty(items).map_err(err)?).map_err(err)
    }
    fn safe_profile_path(file_name: &str) -> Result<PathBuf, String> {
        if file_name.contains(['/', '\\']) || !file_name.ends_with(".toml") { return Err("非法档案文件名".into()); }
        Ok(profiles_dir().join(file_name))
    }
    fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
        let parent = path.parent().ok_or("目标路径没有父目录")?;
        fs::create_dir_all(parent).map_err(err)?;
        let tmp = parent.join(format!(".config-{}.tmp", Uuid::new_v4()));
        let mut file = fs::OpenOptions::new().create_new(true).write(true).open(&tmp).map_err(err)?;
        use std::io::Write;
        file.write_all(content.as_bytes()).map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file);
        replace_file(&tmp, path).inspect_err(|_| { let _ = fs::remove_file(&tmp); })
    }
    #[cfg(windows)]
    fn replace_file(source: &Path, target: &Path) -> Result<(), String> {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};
        let s: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let t: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        let ok = unsafe { MoveFileExW(s.as_ptr(), t.as_ptr(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) };
        if ok == 0 { Err(io::Error::last_os_error().to_string()) } else { Ok(()) }
    }
    #[cfg(not(windows))]
    fn replace_file(source: &Path, target: &Path) -> Result<(), String> { fs::rename(source, target).map_err(err) }

    #[tauri::command]
    pub fn get_config_path() -> String { config_path().display().to_string() }

    #[tauri::command]
    pub fn set_config_path(path: String) -> Result<(), String> {
        let p = PathBuf::from(path.trim());
        if p.file_name().and_then(|x| x.to_str()) != Some("config.toml") { return Err("请选择或填写 config.toml 文件路径".into()); }
        std::env::set_var("CODEX_CONFIG_PATH", p);
        Ok(())
    }

    #[tauri::command]
    pub fn load_codex_config() -> Result<ConfigInfo, String> {
        let path = config_path();
        let content = fs::read_to_string(&path).map_err(|e| format!("无法读取 {}: {e}", path.display()))?;
        let doc = validate_toml(&content)?;
        Ok(ConfigInfo { path: path.display().to_string(), model: doc.get("model").and_then(|x| x.as_str()).map(str::to_owned), provider: doc.get("model_provider").and_then(|x| x.as_str()).map(str::to_owned), content })
    }

    #[tauri::command]
    pub fn list_profiles() -> Result<Vec<TomlProfile>, String> { read_index() }

    #[tauri::command]
    pub fn create_profile_from_current(name: String) -> Result<TomlProfile, String> {
        if name.trim().is_empty() { return Err("档案名称不能为空".into()); }
        let current = load_codex_config()?;
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let profile = TomlProfile { id: id.clone(), name: name.trim().to_owned(), file_name: format!("{id}.toml"), created_at: now.clone(), updated_at: now, last_applied: None };
        fs::create_dir_all(profiles_dir()).map_err(err)?;
        write_atomic(&safe_profile_path(&profile.file_name)?, &current.content)?;
        let mut items = read_index()?; items.push(profile.clone()); write_index(&items)?;
        Ok(profile)
    }

    #[tauri::command]
    pub fn create_empty_profile(name: String) -> Result<TomlProfile, String> {
        if name.trim().is_empty() { return Err("档案名称不能为空".into()); }
        let template = "# Codex config profile\nmodel = \"\"\nmodel_provider = \"\"\n";
        let now = Utc::now().to_rfc3339(); let id = Uuid::new_v4().to_string();
        let profile = TomlProfile { id: id.clone(), name: name.trim().to_owned(), file_name: format!("{id}.toml"), created_at: now.clone(), updated_at: now, last_applied: None };
        fs::create_dir_all(profiles_dir()).map_err(err)?; write_atomic(&safe_profile_path(&profile.file_name)?, template)?;
        let mut items = read_index()?; items.push(profile.clone()); write_index(&items)?; Ok(profile)
    }

    #[tauri::command]
    pub fn load_profile(profile_id: String) -> Result<String, String> {
        let p = read_index()?.into_iter().find(|p| p.id == profile_id).ok_or("档案不存在")?;
        fs::read_to_string(safe_profile_path(&p.file_name)?).map_err(err)
    }

    fn collect_fields(item: &toml_edit::Item, path: &mut Vec<String>, out: &mut Vec<TomlField>) {
        if let Some(table) = item.as_table_like() {
            for (key, child) in table.iter() {
                path.push(key.to_owned());
                if child.is_table() || child.is_array_of_tables() { collect_fields(child, path, out); }
                else if let Some(v) = child.as_value() {
                    let kind = if v.is_str(){"string"}else if v.is_bool(){"boolean"}else if v.is_integer(){"integer"}else if v.is_float(){"float"}else if v.is_datetime(){"datetime"}else{"array"};
                    let value = match kind {
                        "string" => v.as_str().unwrap_or_default().to_owned(),
                        "boolean" => v.as_bool().map(|x| x.to_string()).unwrap_or_default(),
                        "integer" => v.as_integer().map(|x| x.to_string()).unwrap_or_default(),
                        "float" => v.as_float().map(|x| x.to_string()).unwrap_or_default(),
                        "datetime" => v.as_datetime().map(|x| x.to_string()).unwrap_or_default(),
                        _ => v.to_string(),
                    };
                    let key = path.last().cloned().unwrap_or_default(); let section = if path.len()>1 { path[..path.len()-1].join(".") } else { "常规".into() };
                    out.push(TomlField { path: path.clone(), section, key, kind: kind.into(), value });
                }
                path.pop();
            }
        }
    }

    #[tauri::command]
    pub fn parse_profile_fields(profile_id: String) -> Result<Vec<TomlField>, String> {
        let content = load_profile(profile_id)?; let doc = validate_toml(&content)?; let mut out=Vec::new(); let mut path=Vec::new();
        collect_fields(doc.as_item(), &mut path, &mut out); Ok(out)
    }

    #[tauri::command]
    pub fn parse_toml_content(content: String) -> Result<Vec<TomlField>, String> {
        let doc = validate_toml(&content)?;
        let mut out = Vec::new();
        let mut path = Vec::new();
        collect_fields(doc.as_item(), &mut path, &mut out);
        Ok(out)
    }

    fn set_field(doc: &mut DocumentMut, field: &TomlField) -> Result<(), String> {
        if field.path.is_empty(){return Err("配置项路径为空".into())}
        let new_item = if field.kind == "string" { toml_edit::value(field.value.clone()) } else {
            let snippet=format!("value = {}",field.value); let parsed=validate_toml(&snippet)?; parsed.get("value").cloned().ok_or("无法解析配置值")?
        };
        let mut current=doc.as_item_mut();
        for segment in &field.path[..field.path.len()-1] { current=current.get_mut(segment).ok_or_else(||format!("配置路径不存在: {}",field.path.join(".")))?; }
        let key=field.path.last().unwrap(); let old=current.get_mut(key).ok_or_else(||format!("配置项不存在: {}",field.path.join(".")))?;
        let decor=old.as_value().map(|v|v.decor().clone()); *old=new_item; if let (Some(d),Some(v))=(decor,old.as_value_mut()){*v.decor_mut()=d;} Ok(())
    }

    #[tauri::command]
    pub fn save_profile_fields(profile_id: String, name: String, fields: Vec<TomlField>) -> Result<(), String> {
        let content=load_profile(profile_id.clone())?; let mut doc=validate_toml(&content)?; for field in &fields { set_field(&mut doc,field)?; }
        save_profile_toml(profile_id,name,doc.to_string())
    }


    #[tauri::command]
    pub fn save_profile_toml(profile_id: String, name: String, content: String) -> Result<(), String> {
        validate_toml(&content)?;
        let mut items = read_index()?; let p = items.iter_mut().find(|p| p.id == profile_id).ok_or("档案不存在")?;
        if !name.trim().is_empty() { p.name = name.trim().to_owned(); }
        p.updated_at = Utc::now().to_rfc3339();
        write_atomic(&safe_profile_path(&p.file_name)?, &content)?; write_index(&items)
    }

    #[tauri::command]
    pub fn delete_profile(profile_id: String) -> Result<(), String> {
        let mut items = read_index()?; let pos = items.iter().position(|p| p.id == profile_id).ok_or("档案不存在")?;
        let p = &items[pos];
        if p.last_applied.is_some() { return Err("无法删除：该配置当前已启用，请先启用其他配置或使用「全部取消启用」后再删除".into()); }
        let p = items.remove(pos); let path = safe_profile_path(&p.file_name)?; if path.exists() { fs::remove_file(path).map_err(err)?; } write_index(&items)
    }

    #[tauri::command]
    pub fn apply_profile(profile_id: String) -> Result<ApplyResult, String> {
        let mut items = read_index()?;
        // 清除所有配置的启用状态，确保只有一个已启用
        for item in items.iter_mut() {
            item.last_applied = None;
        }
        let p = items.iter_mut().find(|p| p.id == profile_id).ok_or("档案不存在")?;
        let content = fs::read_to_string(safe_profile_path(&p.file_name)?).map_err(err)?; validate_toml(&content)?;
        let target = config_path(); if !target.exists() { return Err(format!("本地配置不存在: {}", target.display())); }
        write_atomic(&target, &content)?;
        p.last_applied = Some(Utc::now().to_rfc3339()); p.updated_at = Utc::now().to_rfc3339(); write_index(&items)?;
        Ok(ApplyResult { applied_path: target.display().to_string() })
    }

    #[tauri::command]
    pub fn open_config_directory() -> Result<(), String> { let p = config_path(); std::process::Command::new("explorer").arg(p.parent().unwrap_or(Path::new("."))).spawn().map(|_| ()).map_err(err) }

    #[tauri::command]
    pub fn reset_all_enabled() -> Result<(), String> {
        let mut items = read_index()?;
        for item in items.iter_mut() {
            item.last_applied = None;
        }
        write_index(&items)
    }

    #[cfg(test)] mod tests { use super::*; #[test] fn invalid_toml_is_rejected(){ assert!(validate_toml("[bad").is_err()); } #[test] fn default_path_is_toml(){ assert_eq!(config_path().file_name().unwrap(), "config.toml"); } #[test] fn scalar_numbers_are_exposed(){ let doc=validate_toml("count = 42\nratio = 1.5\nenabled = true").unwrap(); let mut out=Vec::new(); collect_fields(doc.as_item(),&mut Vec::new(),&mut out); assert!(out.iter().any(|f|f.key=="count"&&f.value=="42")); assert!(out.iter().any(|f|f.key=="ratio"&&f.value=="1.5")); assert!(out.iter().any(|f|f.key=="enabled"&&f.value=="true")); } }
}
