fn main() {
    println!("cargo:rerun-if-env-changed=NOTCH_REPO_ROOT");
    tauri_build::build();
}
