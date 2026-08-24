fn main() {
    put_webview2_loader_beside_test_binaries();
    tauri_build::build()
}

/// Make `cargo test` work on Windows.
///
/// Tauri links `WebView2Loader.dll` through an import library, so anything
/// that links this crate needs that DLL beside it at load time. Tauri's own
/// bundling puts it next to the app, but test binaries live in
/// `target/<profile>/deps/`, where nothing puts it — so on Windows every test
/// binary died with STATUS_ENTRYPOINT_NOT_FOUND before running a single test.
///
/// `webview2-com-sys` unpacks the DLL into its own `OUT_DIR`, which is a
/// sibling of ours, so it can be found from here and copied across. Best
/// effort throughout: a missing DLL is a broken `cargo test` on one platform,
/// never a broken build.
#[cfg(windows)]
fn put_webview2_loader_beside_test_binaries() {
    use std::path::{Path, PathBuf};

    const DLL: &str = "WebView2Loader.dll";

    // OUT_DIR is target/<profile>/build/<crate>-<hash>/out
    let Ok(out_dir) = std::env::var("OUT_DIR") else {
        return;
    };
    let out_dir = PathBuf::from(out_dir);
    let Some(build_dir) = out_dir.ancestors().nth(2) else {
        return;
    };
    let Some(profile_dir) = build_dir.parent() else {
        return;
    };

    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x64",
        Ok("x86") => "x86",
        Ok("aarch64") => "arm64",
        _ => return,
    };

    let find = |dir: &Path| -> Option<PathBuf> {
        std::fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
            let name = entry.file_name();
            if !name.to_string_lossy().starts_with("webview2-com-sys-") {
                return None;
            }
            let candidate = entry.path().join("out").join(arch).join(DLL);
            candidate.is_file().then_some(candidate)
        })
    };

    let Some(source) = find(build_dir) else {
        return;
    };
    let deps = profile_dir.join("deps");
    if deps.is_dir() {
        let _ = std::fs::copy(&source, deps.join(DLL));
    }
    // Integration tests spawn the app binary itself, which sits one level up.
    let _ = std::fs::copy(&source, profile_dir.join(DLL));
}

#[cfg(not(windows))]
fn put_webview2_loader_beside_test_binaries() {}
