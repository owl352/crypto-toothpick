use std::env;
use std::path::Path;

fn main() {
    match env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("wasi") => setup_wasi(),
        _ => napi_build::setup(),
    }
}

/// `napi_build::setup()` links emnapi's multi-threaded runtime
/// (`emnapi-basic-mt`) unconditionally, which is built for
/// `wasm32-wasip1-threads`: it pulls in TLS globals the plain `wasm32-wasip1`
/// module cannot define, and the result fails to compile in the engine
/// ("immutable global cannot be assigned"). Nothing here is async or
/// multi-threaded, so link the single-threaded runtime instead and keep the
/// module on the non-threads target — where memory is the module's own rather
/// than an imported `SharedArrayBuffer`, so browsers need no cross-origin
/// isolation to load it.
fn setup_wasi() {
    let link_dir = env::var("EMNAPI_LINK_DIR").expect("EMNAPI_LINK_DIR must be set");
    println!("cargo:rerun-if-env-changed=EMNAPI_LINK_DIR");
    println!("cargo:rustc-link-search={link_dir}");
    println!("cargo:rustc-link-lib=static=emnapi-basic");

    // The loader looks these up on the instance: the registration entry point,
    // the allocator emnapi hands JS buffers through, and the indirect function
    // table it installs callbacks into.
    println!("cargo:rustc-link-arg=--export=malloc");
    println!("cargo:rustc-link-arg=--export=free");
    println!("cargo:rustc-link-arg=--export=napi_register_wasm_v1");
    println!("cargo:rustc-link-arg=--export-if-defined=node_api_module_get_api_version_v1");
    println!("cargo:rustc-link-arg=--export-table");

    // napi symbols are resolved from the host at instantiation time.
    println!("cargo:rustc-link-arg=--import-undefined");

    // lld defaults to a 1MiB stack; the eleven digest contexts x11 chains
    // together are a few KB each, but the napi glue is generous with
    // temporaries, so give it room.
    println!("cargo:rustc-link-arg=-zstack-size=8388608");

    // Reactor rather than command: there is no `main`, the host calls exports.
    // rustc links this itself for cdylib on some versions only.
    let rustc_path = env::var("RUSTC").expect("RUSTC must be set by Cargo");
    let target = env::var("TARGET").expect("TARGET must be set by Cargo");
    let crt_reactor_path = Path::new(&rustc_path)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| {
            p.join("lib")
                .join("rustlib")
                .join(target)
                .join("lib")
                .join("self-contained")
                .join("crt1-reactor.o")
        });

    if let Some(path) = crt_reactor_path.filter(|path| path.exists()) {
        println!("cargo:rustc-link-arg={}", path.display());
        println!("cargo:rustc-link-arg=--export=_initialize");
    }
}
