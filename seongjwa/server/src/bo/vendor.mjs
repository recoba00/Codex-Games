// 백오피스 WebP 인코더 파일(vendor/README.md). 워커 번들 규칙: .txt = 문자열, .bin = ArrayBuffer
import js from "./vendor/webp_enc.txt";
import wasm from "./vendor/webp_enc.wasm.bin";

const year = "public, max-age=31536000, immutable";
export const VENDOR = {
  "/bo/vendor/webp_enc.js": () => new Response(js, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": year } }),
  "/bo/vendor/webp_enc.wasm": () => new Response(wasm, { headers: { "content-type": "application/wasm", "cache-control": year } })
};
