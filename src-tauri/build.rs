fn main() {
    // A release without this feature connects to devUrl even with --release.
    // Fail the build rather than ship an installer that needs a local Vite server.
    if std::env::var("PROFILE").as_deref() == Ok("release")
        && std::env::var_os("CARGO_FEATURE_CUSTOM_PROTOCOL").is_none()
    {
        panic!("Release builds require --features custom-protocol to embed the frontend");
    }
    tauri_build::build()
}
