#!/usr/bin/env bash
# shellcheck disable=SC2312
set -euo pipefail

# Shrinks the module (~290KB -> ~270KB) and speeds up the digest chain. The
# enabled features are the ones rustc's `wasm32-wasip1` target uses by default;
# threads and SIMD are deliberately absent, this module has neither. A system
# binaryen is preferred; otherwise the `wasm-opt` npm devDependency provides the
# binary.
if command -v wasm-opt &> /dev/null; then
  WASM_OPT=wasm-opt
else
  WASM_OPT="npx wasm-opt"
fi

echo "Optimizing wasm using Binaryen (${WASM_OPT})"
${WASM_OPT} \
    --enable-bulk-memory \
    --enable-mutable-globals \
    --enable-sign-ext \
    --enable-nontrapping-float-to-int \
    -O3 \
    "${OUTPUT_FILE}" \
    -o \
    "${OUTPUT_FILE}"
