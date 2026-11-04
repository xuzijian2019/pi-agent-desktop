# Dependency security remediation (2026-11-04)

This deliberately limited update changes dependencies, generated preview-runtime
metadata, and security regression tests. One JSON transport compatibility fix is
required by patched Next; application features and native code are unchanged.
SDK and Tauri versions stay unchanged. No forced major dependency upgrade is used.

## Fixed

- Root and demo Next.js/eslint-config-next: 16.4.5. This addresses the image
  optimizer RCE (GHSA-2464-fhr4-w9xw), Server Actions DoS (GHSA-p3m5-59mp-jv5r),
  and typed-array cache RCE (GHSA-673q-mjm6-r5xr), affecting Next 16.x through 16.4.0.
- Zod: 4.6.7 within existing consumers' accepted ranges, addressing oversized
  constrained collection memory exhaustion (GHSA-mrhx-c7xc-m3w5; fixed at 4.6.6).
- DOMPurify: 3.4.17, fixing GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and
  GHSA-c6gr-qvv4-5v3f through a compatible patch.
- decode-uri-component: 0.5.1, fixing quadratic decoding DoS
  (GHSA-qr28-fpjm-wq7f).
- Sucrase: 3.35.1 replaces glob with tinyglobby, removing glob cancellation bypass
  (GHSA-3g3m-2fjr-6pw4) and its old minimatch dependency. Regenerate the committed
  offline preview runtime so its version matches the lockfile.

The existing eslint-plugin-react-hooks 7.0.1 is explicitly retained, as it already
was in demo. Next's new lint config otherwise selects 7.1.1 and introduces 12
manual-memoization errors in existing application code. Its Zod dependency is
patched; no lint rule is disabled here. A compiler-lint migration is separate work.

## Deliberately not forced

The moderate minimatch amplification finding (GHSA-g3hv-75wg-m249) remains in
development lint tooling. Its fixed v11 API is incompatible with ESLint/plugins'
callable v3 API and outside typescript-eslint's v10 range. Wait for compatible
upstream releases or backports rather than adding a blanket override.

Demo KaTeX remains on its existing 0.16 line. The low-severity prototype-pollution
trust bypass (GHSA-238p-pmpm-9mq7) needs >=0.18.2, outside that accepted range. A
renderer upgrade is left for a separate review instead of broadening this fix.
This is not a claim that the full dependency audit is clean.

The application currently disables image optimization (`images.unoptimized`).
That reduces exposure to the image-optimizer advisory but is not a substitute for
patching Next, nor proof that every advisory is unreachable. Severity labels are
not proof of exploitation of this application. Network exposure and use of the
affected validation paths determine practical urgency.

Run `npm audit` and `npm audit --omit=dev` in root, demo and relay to refresh the
results. The lockfile regression test supplements, not replaces, live advisories.

## Verification

- Root full audit: 16 moderate, all in the development minimatch chain;
  `--omit=dev`: 0. Relay full audit: 0.
- Demo full audit: 21 (16 moderate, 5 low); `--omit=dev`: 5 low KaTeX-chain
  findings. The high source-map-js advisory GHSA-68fv-2mgg-jv7q is fixed by
  its compatible 1.2.2 patch. No high or critical audit findings remain.
- Root clean install, lint (0 errors, 20 existing warnings), TypeScript,
  3,585 tests, and isolated desktop-mode Next production build passed.
- Demo clean install, lint, TypeScript, direct Next static production build pass.
  Standard npm build's existing prepare script follows `.claude/skills` as a
  file and can fail with EISDIR; direct Next build tests compilation separately.
- Local browser E2E is not claimed: Chromium is blocked by the execution
  environment's Unix-socket sandbox. Native packaging is not locally verified.
- Production-only npm audit excludes devDependencies even when a package feeds
  a bundled UI asset. These counts are not a complete runtime risk assessment.

## Next 16.4 response compatibility

The first exact-head CI found a real transport regression: Next 16.4.5's Node
`sendResponse` adapter strips Content-Encoding from Route Handler Responses.
Our former manual gzip helper therefore delivered compressed session JSON
without its encoding header. Browser/API consumers could not parse the data.

Return plain JSON at the Route Handler boundary and leave HTTP compression to
Next's server (enabled by default). This preserves session payloads, response
status, content type and cache headers, without patching Next or disabling its
security fix. Tests exercise a large session list across a real local HTTP
connection through Next's actual Node response adapter, including a client
that accepts gzip. Do not weaken/skip E2E or raise timeouts to hide this failure.

After the transport adjustment, all 3,588 local tests, lint, typecheck and the
production build pass. A production-server HTTP smoke also parses seeded
sessions with gzip, identity and disabled-gzip requests while retaining no-store.
