const path = require("node:path");
const toml = require("toml");
const { exec, execSync } = require("child_process");
const { promisify } = require("node:util");
const fs = require("fs");
const { convertBinary } = require("./utils/convertBinary.mjs");
const {
  getStructsForEsmExport,
} = require("./utils/getStructsForEsmExport.mjs");
const { name: moduleName } = require("./package.json");
const typingsForCodegen = 'export * from "./bindingsTypes.ts"';

const buildProfile = process.env.PROFILE ?? "release";
const isRelease = buildProfile === "release";
const wasmOptScript =
  process.env.WASM_OPT_SCRIPT ?? path.join(__dirname, "scripts/wasm-opt.sh");
const binariesOutputDir =
  process.env.BIN_OUTPUT_DIR ?? path.join(__dirname, "pkg", "binaries");
const templatesOutputDir =
  process.env.JS_OUTPUT_DIR ?? path.join(__dirname, "pkg");

// ferric builds the React Native artifacts for its Android targets with the
// NDK's clang, but rs-x11-hash's build script wants the sysroot spelled out
// (the `cargo-ndk` convention) before it will compile the x11 C sources.
const ndkVersion = process.env.FERRIC_NDK_VERSION ?? "27.1.12297006";

const specificTarget = process.env.NATIVE_BUILD_TARGET;

const nativeTargets = specificTarget
  ? specificTarget.split(',').map(t => t.trim())
  : [
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "x86_64-unknown-linux-musl",
    "aarch64-unknown-linux-musl",
    "x86_64-pc-windows-msvc",
    "aarch64-pc-windows-msvc",
  ];

// Plain wasip1, not wasip1-threads: everything exported here is synchronous, so
// the module needs no wasm threads — which keeps it on stable Rust, with no
// `-Z build-std` and no shared memory on the JS side.
const wasmTarget = "wasm32-wasip1";

const emnapi = path.join(
  require.resolve("emnapi"),
  "..",
  "lib",
  wasmTarget,
);

const cargoTomlPath = path.join(__dirname, "Cargo.toml");
const fileContent = fs.readFileSync(cargoTomlPath, "utf8");
const {
  package: { name: rustCrateName },
} = toml.parse(fileContent);

const binName = rustCrateName.replace(/-/g, "_");
const execTask = promisify(exec);

/**
 * The x11 digests are C sources, compiled by rs-x11-hash's build script with
 * plain `clang`/`llvm-ar` off the PATH when the target is wasm. Apple's clang
 * has no wasm backend, so point the wasm build at an LLVM that does — Homebrew's
 * by default, overridable for other layouts.
 */
function wasmClangDir() {
  if (process.env.WASM_CLANG_DIR) {
    return process.env.WASM_CLANG_DIR;
  }

  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const prefix = execSync("brew --prefix llvm", { encoding: "utf8" }).trim();
    const bin = path.join(prefix, "bin");

    return fs.existsSync(path.join(bin, "clang")) ? bin : null;
  } catch {
    // No Homebrew, or no llvm formula: fall back to whatever is on the PATH
    // and let clang report the problem itself.
    return null;
  }
}

/**
 * rs-x11-hash's build script reads `CARGO_NDK_SYSROOT_PATH` for Android targets
 * and panics without it, but ferric drives cargo itself and only points the
 * toolchain variables at the NDK. Derive the sysroot from the same NDK ferric
 * uses and hand it over, so the x11 C sources compile under it.
 */
function ndkEnv() {
  const androidHome = process.env.ANDROID_HOME;

  if (process.env.CARGO_NDK_SYSROOT_PATH) {
    return {};
  }

  if (!androidHome) {
    // No Android SDK: ferric skips its Android targets, and nothing needs this.
    return {};
  }

  const prebuiltDir = path.join(
    androidHome, "ndk", ndkVersion, "toolchains", "llvm", "prebuilt"
  );

  if (!fs.existsSync(prebuiltDir)) {
    return {};
  }

  const [host] = fs.readdirSync(prebuiltDir);
  const sysroot = path.join(prebuiltDir, host, "sysroot");

  return fs.existsSync(sysroot) ? { CARGO_NDK_SYSROOT_PATH: sysroot } : {};
}

async function main() {
  console.log(`--- Building WASM (${wasmTarget}) ---`);
  const targetWasmFile = path.join(
    __dirname, "target", wasmTarget, buildProfile, `${binName}.wasm`
  );

  const clangDir = wasmClangDir();

  await execTask(
    `cargo build --target ${wasmTarget} ${isRelease ? "--release" : ""}`,
    {
      env: {
        ...process.env,
        EMNAPI_LINK_DIR: emnapi,
        PATH: clangDir ? `${clangDir}:${process.env.PATH}` : process.env.PATH,
      },
    }
  );

  console.log("--- Building Native Binaries ---");

  const darwinTargets = nativeTargets.filter(t => t.includes("apple-darwin"));
  // zig cannot emit the MSVC ABI, so windows goes through cargo-xwin (clang-cl
  // + lld-link against the Microsoft CRT/SDK headers xwin downloads).
  const windowsTargets = nativeTargets.filter(t => t.includes("windows"));
  const zigbuildTargets = nativeTargets.filter(
    t => !t.includes("apple-darwin") && !t.includes("windows")
  );

  if (darwinTargets.length > 0) {
    const targetFlags = darwinTargets.map(t => `--target ${t}`).join(" ");
    console.log(`Building darwin targets with cargo: ${darwinTargets.join(", ")}...`);

    await execTask(
      `cargo build ${targetFlags} ${isRelease ? "--release" : ""}`,
      { env: { ...process.env }, maxBuffer: 1024 * 1024 * 50 }
    );
  }

  if (zigbuildTargets.length > 0) {
    const targetFlags = zigbuildTargets.map(t => `--target ${t}`).join(" ");
    console.log(`Building cross targets with zigbuild: ${zigbuildTargets.join(", ")}...`);

    await execTask(
      `cargo zigbuild ${targetFlags} ${isRelease ? "--release" : ""}`,
      { env: { ...process.env }, maxBuffer: 1024 * 1024 * 50 }
    );
  }

  // One invocation per windows target: cargo-xwin injects the SDK/CRT lib
  // paths via RUSTFLAGS, and with several `--target` flags only the last
  // target's paths survive, so the others fail to link ("machine type x64
  // conflicts with arm64"). Requires XWIN_ACCEPT_LICENSE=1 in the environment
  // (accepts Microsoft's license for the CRT/SDK headers xwin downloads).
  for (const target of windowsTargets) {
    console.log(`Building windows target with xwin: ${target}...`);

    await execTask(
      `cargo xwin build --target ${target} ${isRelease ? "--release" : ""}`,
      { env: { ...process.env }, maxBuffer: 1024 * 1024 * 50 }
    );
  }

  nativeTargets.forEach((target) => {
    let extension;
    // MSVC emits `crypto_toothpick.dll`; the unix toolchains prefix with `lib`.
    let prefix = "lib";

    if (target.includes("apple-darwin")) {
      extension = "dylib";
    } else if (target.includes("windows")) {
      extension = "dll";
      prefix = "";
    } else {
      extension = "so";
    }

    const nativeBinPath = path.join(
      __dirname, "target", target, buildProfile, `${prefix}${binName}.${extension}`
    );

    const nativeOutputDir = path.join(binariesOutputDir, "native", target);

    if (fs.existsSync(nativeBinPath)) {
      if (!fs.existsSync(nativeOutputDir)) {
        fs.mkdirSync(nativeOutputDir, { recursive: true });
      }

      const destPath = path.join(nativeOutputDir, `${binName}.node`);

      fs.copyFileSync(nativeBinPath, destPath);
      console.log(`Successfully built and copied: ${target}`);
    } else {
      console.error(`FAILED: File not found for ${target}: ${nativeBinPath}`);
    }
  });

  console.log("--- Post-build processing ---");

  console.log("Running ferric-cli");
  await execTask(
    `npm run ferric:build -- --configuration ${buildProfile} --output ${binariesOutputDir}`,
    {
      env: { ...process.env, ...ndkEnv() },
      maxBuffer: 1024 * 1024 * 50,
    },
  );

  console.log("Running wasm-opt");
  await execTask(wasmOptScript, {
    env: { ...process.env, OUTPUT_FILE: targetWasmFile.toString() },
  });

  // Chrome refuses to sync-compile wasm larger than 8MB on the main thread,
  // and the browser entry instantiates synchronously at import time.
  const CHROME_SYNC_COMPILE_LIMIT = 8 * 1024 * 1024;
  const wasmSize = fs.statSync(targetWasmFile).size;
  if (wasmSize >= CHROME_SYNC_COMPILE_LIMIT) {
    throw new Error(
      `wasm binary is ${(wasmSize / 1024 / 1024).toFixed(2)}MB — over Chrome's ` +
      "8MB main-thread sync-compile limit; the browser build would break at import time.",
    );
  }
  console.log(`wasm size after wasm-opt: ${(wasmSize / 1024).toFixed(0)}KB`);

  const wasmOutputDir = path.join(binariesOutputDir, "wasm");
  if (!fs.existsSync(wasmOutputDir)) {
    fs.mkdirSync(wasmOutputDir, { recursive: true });
  }

  await convertBinary(targetWasmFile, path.join(wasmOutputDir, "wasmBytes.cjs"));

  console.log("Copying templates");
  fs.cpSync("./templates", templatesOutputDir, { recursive: true });

  console.log("Patching exports and typings...");
  // ferric emits this alongside the React Native artifacts: it runs the napi-rs
  // CLI, which stitches the type-def fragments `#[napi]` writes at compile time
  // into a .d.ts. It is the source for every typing below.
  const wasmTypesPath = path.join(binariesOutputDir, `${binName}.d.ts`);
  const exports = getStructsForEsmExport(wasmTypesPath.toString());

  fs.writeFileSync(
    path.join(binariesOutputDir, `${binName}.js`),
    [
      "/* eslint-disable */",
      "import {requireNodeAddon} from 'react-native-node-api'",
      `export const { ${exports.join(", ")} } = requireNodeAddon('./${moduleName}--${binName}')`,
    ].join("\n\n") + "\n",
    "utf8",
  );

  const wasmInitScript = fs.readFileSync(
    path.join(binariesOutputDir, "wasm.js"),
    { encoding: "utf8" },
  );

  fs.writeFileSync(
    path.join(binariesOutputDir, "wasm.js"),
    wasmInitScript.replace(
      "/* exports here */",
      `export const { ${exports.join(", ")} }`,
    ),
  );

  // napi-rs emits the constants as `export const X: number`, which is a type
  // error in a .ts file (no initializer). The whole file is ambient — it
  // describes the binary — so mark the constants `declare` like the functions
  // already are.
  const types = fs.readFileSync(wasmTypesPath, { encoding: "utf8" });
  fs.writeFileSync(
    path.join(binariesOutputDir, "bindingsTypes.ts"),
    types
      .replace(/^export const /gm, "export declare const ")
      .replace(/const enum/g, "enum"),
  );

  fs.writeFileSync(path.join(binariesOutputDir, "wasm.d.ts"), typingsForCodegen);
  fs.writeFileSync(path.join(binariesOutputDir, "wasmCreation.d.ts"), typingsForCodegen);
  fs.writeFileSync(path.join(binariesOutputDir, "node.d.ts"), typingsForCodegen);
  fs.writeFileSync(path.join(binariesOutputDir, `${binName}.d.ts`), typingsForCodegen);

  console.log("Done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
