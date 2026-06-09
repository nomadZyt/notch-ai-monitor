use std::{
    env,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const APP_NAME: &str = "Notch AI Monitor";
const DEFAULT_PENDING_ACTION_SWEEP_INTERVAL_MS: &str = "30000";
const COMPACT_WIDTH: f64 = 820.0;
const COMPACT_HEIGHT: f64 = 120.0;
const EXPANDED_HEIGHT: f64 = 560.0;

struct ManagerState {
    child: Mutex<Option<Child>>,
    log_file: PathBuf,
}

#[tauri::command]
fn set_surface_expanded(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    let height = if expanded { EXPANDED_HEIGHT } else { COMPACT_HEIGHT };
    window
        .set_size(LogicalSize::new(COMPACT_WIDTH, height))
        .map_err(|error| error.to_string())
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn write_log(log_file: &Path, level: &str, message: &str) {
    if let Some(parent) = log_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = writeln!(file, "[{}] [{}] {}", now_millis(), level, message);
    }
}

fn app_support_dir() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join(APP_NAME))
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("failed to create {}: {error}", path.display()))
}

fn resolve_repo_root() -> Result<PathBuf, String> {
    if let Ok(repo_root) = env::var("NOTCH_REPO_ROOT") {
        return Ok(PathBuf::from(repo_root));
    }

    if let Some(repo_root) = option_env!("NOTCH_REPO_ROOT") {
        let path = PathBuf::from(repo_root);
        if path.join("packages/local-manager-api/dist/src/bin/server.js").exists() {
            return Ok(path);
        }
    }

    let mut current = env::current_dir().map_err(|error| error.to_string())?;
    loop {
        if current.join("package.json").exists()
            && current.join("apps/desktop/dist/index.html").exists()
            && current
                .join("packages/local-manager-api/dist/src/bin/server.js")
                .exists()
        {
            return Ok(current);
        }
        if !current.pop() {
            break;
        }
    }

    Err("Unable to locate repo root. Set NOTCH_REPO_ROOT before launching the Tauri MVP.".to_string())
}

fn parse_manager_url(line: &str) -> Option<String> {
    let marker = "listening at ";
    let start = line.find(marker)? + marker.len();
    let rest = &line[start..];
    let end = rest.find(' ').unwrap_or(rest.len());
    let url = &rest[..end];
    if url.starts_with("http://127.0.0.1:") {
        Some(url.to_string())
    } else {
        None
    }
}

fn start_manager(repo_root: &Path, log_file: &Path) -> Result<(Child, String), String> {
    let support_dir = app_support_dir()?;
    let process_dir = support_dir.join("process-state");
    let history_dir = support_dir.join("event-history");
    ensure_dir(&process_dir)?;
    ensure_dir(&history_dir)?;

    let manager_bin = repo_root.join("packages/local-manager-api/dist/src/bin/server.js");
    let node_bin = env::var("NOTCH_NODE_BIN").unwrap_or_else(|_| "node".to_string());
    let process_side_effects =
        env::var("NOTCH_TAURI_PROCESS_SIDE_EFFECTS").unwrap_or_else(|_| "supervised".to_string());
    let sweep_interval = env::var("NOTCH_TAURI_PENDING_ACTION_SWEEP_INTERVAL_MS")
        .unwrap_or_else(|_| DEFAULT_PENDING_ACTION_SWEEP_INTERVAL_MS.to_string());

    let mut child = Command::new(node_bin)
        .arg(manager_bin)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("0")
        .arg("--process-side-effects")
        .arg(&process_side_effects)
        .arg("--process-persistence-file")
        .arg(process_dir.join("process-state.json"))
        .arg("--event-history-persistence-file")
        .arg(history_dir.join("event-history.json"))
        .arg("--pending-action-sweep-interval-ms")
        .arg(&sweep_interval)
        .env("NOTCH_APP_MANAGED", "1")
        .current_dir(repo_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start Local Manager API: {error}"))?;

    write_log(
        log_file,
        "info",
        &format!(
            "manager process starting pid={:?} sideEffects={} processState={} eventHistory={}",
            child.id(),
            process_side_effects,
            process_dir.join("process-state.json").display(),
            history_dir.join("event-history.json").display()
        ),
    );

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "manager stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "manager stderr unavailable".to_string())?;
    let (tx, rx) = mpsc::channel::<String>();
    let stdout_log = log_file.to_path_buf();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            write_log(&stdout_log, "info", &format!("manager stdout {}", line));
            if let Some(url) = parse_manager_url(&line) {
                let _ = tx.send(url);
            }
        }
    });

    let stderr_log = log_file.to_path_buf();
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            write_log(&stderr_log, "warn", &format!("manager stderr {}", line));
        }
    });

    let manager_url = rx
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "timed out waiting for Local Manager API startup".to_string())?;
    write_log(
        log_file,
        "info",
        &format!("manager process healthy pid={} url={}", child.id(), manager_url),
    );
    Ok((child, manager_url))
}

fn encode_query_component(value: &str) -> String {
    value
        .replace('%', "%25")
        .replace(':', "%3A")
        .replace('/', "%2F")
        .replace('?', "%3F")
        .replace('&', "%26")
        .replace('=', "%3D")
}

fn top_center_position(app: &tauri::App) -> LogicalPosition<f64> {
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return LogicalPosition::new(300.0, 0.0);
    };
    let scale = monitor.scale_factor();
    let size = monitor.size();
    let logical_width = size.width as f64 / scale;
    let logical_x = ((logical_width - COMPACT_WIDTH) / 2.0).max(0.0);
    LogicalPosition::new(logical_x, 0.0)
}

fn create_surface_window(app: &tauri::App, manager_url: &str) -> tauri::Result<()> {
    let encoded_manager = encode_query_component(manager_url);
    let mut query = format!("manager=api&managerUrl={encoded_manager}&surface=tauri-mvp");
    if let Ok(initial_panel) = env::var("NOTCH_TAURI_INITIAL_PANEL") {
        if initial_panel == "sessions" || initial_panel == "action" {
            query.push_str("&initialPanel=");
            query.push_str(&initial_panel);
        }
    }
    let url = WebviewUrl::App(format!("index.html?{query}").into());

    let position = top_center_position(app);

    WebviewWindowBuilder::new(app, "main", url)
        .title(APP_NAME)
        .inner_size(COMPACT_WIDTH, COMPACT_HEIGHT)
        .position(position.x, position.y)
        .decorations(false)
        .transparent(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible_on_all_workspaces(true)
        .build()?;
    Ok(())
}

fn shutdown_manager(state: &ManagerState) {
    let Ok(mut child_guard) = state.child.lock() else {
        return;
    };
    let Some(mut child) = child_guard.take() else {
        return;
    };

    write_log(
        &state.log_file,
        "info",
        &format!("manager graceful shutdown requested pid={}", child.id()),
    );
    let _ = child.kill();
    let _ = child.wait();
    write_log(
        &state.log_file,
        "info",
        &format!("manager process exited pid={}", child.id()),
    );
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let support_dir = app_support_dir().map_err(|error| anyhow_error(error))?;
            let log_file = support_dir.join("logs").join("tauri-mvp.log");
            let repo_root = resolve_repo_root().map_err(|error| anyhow_error(error))?;
            write_log(
                &log_file,
                "info",
                &format!("tauri mvp starting repoRoot={}", repo_root.display()),
            );
            let (manager_child, manager_url) =
                start_manager(&repo_root, &log_file).map_err(|error| anyhow_error(error))?;

            app.manage(ManagerState {
                child: Mutex::new(Some(manager_child)),
                log_file,
            });

            let app_handle = app.handle().clone();
            if let Ok(mut signals) = signal_hook::iterator::Signals::new([
                signal_hook::consts::SIGINT,
                signal_hook::consts::SIGTERM,
            ]) {
                thread::spawn(move || {
                    if signals.forever().next().is_some() {
                        let state = app_handle.state::<ManagerState>();
                        shutdown_manager(&state);
                        std::process::exit(0);
                    }
                });
            }

            create_surface_window(app, &manager_url)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_surface_expanded])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<ManagerState>();
                shutdown_manager(&state);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Notch AI Monitor Tauri MVP");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            let state = app_handle.state::<ManagerState>();
            shutdown_manager(&state);
        }
    });
}

fn anyhow_error(message: String) -> Box<dyn std::error::Error> {
    message.into()
}
