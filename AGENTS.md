# Codex project instructions — Pátio Monitor

## Product
This is a São Paulo bus operations digital-twin *visualization*, with a premium, clean, videogame-like isometric 3D diorama. It is NOT a CRUD dashboard and NOT a CSS animation imitation.

## Non-negotiables
1. **3D canvas is mandatory**: Three.js + @react-three/fiber v9. Model buses are actual licensed/custom authored GLB/glTF meshes with windows, wheel geometry, doors, roof, lights and SP-inspired livery; street, terminal and buildings use real 3D geometry. **Never replace buses with boxes, CSS divs, 2D emoji, flat rectangles or moving cards.** HTML/Tailwind is for overlay controls only.
2. **Geographic truth**: all real-vehicle markers originate from authenticated SPTrans Olho Vivo positions. Preserve source `observed_at`, `received_at`, raw identifiers, and an explicit data mode. A garage/terminal geometry must be sourced from public GeoJSON/OSM/georeferenced measurements; do not call a fictional floorplan a faithful reconstruction.
3. **No invented telemetry**: not parking bay, fuel, maintenance, charging, license plate, speed, bearing, doors, authorization, occupancy unless the source actually provides it. Derived heading/geofence must be tagged `INFERRED` with uncertainty. Show staleness.
4. **Data modes**: `LIVE` (current external observation), `REPLAY` (historical observations), `DEMO` (synthetic explicitly labeled). Mode badge must remain prominent. Never render synthetic samples under LIVE.
5. **Quality gate**: no acceptance if GLB model not loading, camera not interacting, bus not selectable, real-world coordinates not mapping to position, or UI is screenshots-only. Screenshot+browser verification required.
6. **Single source of truth**: read `docs/BLUEPRINT.md` and reference screenshots, do not autonomously change stack without documenting an ADR.
7. **Deliver working vertical slices**, each with `pnpm build`, `pytest`, Playwright screenshot/e2e smoke, and updated README; no one giant untestable generation.
8. **No exposed tokens**; SPTrans auth only in server-side environment; never publish credentials. Respect tile and data licensing and provider limits.
9. **FIAP scope**: preserve a path to all seven subjects (RAG agent/local LLM, Airflow+Databricks, trained CV, RPA, DevSecOps Terraform, existing Maker robot with additional sensor, BI pitch); do not falsely mark these done when only a placeholder exists.
10. **Stop before substitution**: If no legitimate GLB is available, make asset production the blocker/task rather than silently replacing with box primitives. If SPTrans auth fails, implement explicit offline mode plus signed/verified fixture format and show `DEMO`/`REPLAY` labels.

## Implementation defaults
- Monorepo: `apps/web` (Vite React TypeScript), `services/api` (FastAPI Python 3.12), `packages/contracts` (data JSON schemas + TS types), `pipelines` (FIAP batch), `assets/` (GLBs and license manifest).
- 3D: three, @react-three/fiber@^9, @react-three/drei; GLTFLoader/useGLTF, instancing as appropriate; `proj4` for fixed São Paulo local metric projection (UTM 23S/WGS84), no arbitrary pixel mapping.
- State & UI: Zustand, TanStack Query, Tailwind, shadcn/ui, Lucide, CSS only overlays.
- Geomap: MapLibre GL JS for a *secondary inset/route view*, not mixed into the first full-size Three.js scene; optional deck.gl Phase 2.
- Backend: httpx authenticated SPTrans adapter, normalized Pydantic schemas, Postgres(+PostGIS), WS for browser updates, separate batch/analytics Airflow work.

## Prioritize visual quality, but never claim unsupported operational accuracy
Target gentle shadows, clean baked ambient occlusion, convincing reflections, polished bus meshes and human-scale scene geometry. Do not overuse bloom/neon/glow or fake dashboard statistics. Respect keyboard and mouse input, reduced motion and WebGL fallback.

## Approved target and implementation gates (2026-11-06)
- The PRIMARY and APPROVED visual reference is `references/00-APPROVED-visual-target.png`. Prior references remain mood/asset references only. Respect its airy, daylight, São Paulo bus-depot aesthetic, off-white UI shell, restrained status display and 75-85% WebGL 3D viewport. Do not copy the reference's fictional metrics, pretend its specific depot is real, or use its pixels as a background.
- Stage gate 1: actual WebGL Canvas + licensed authored `.glb` bus model; orbit/pan/zoom and selection; rendered Playwright screenshot + WebGL console check. A screenshot-styled static background, CSS transforms, Babylon/Three placeholders or rotating BoxGeometry bus FAIL.
- Stage gate 2: backend real provider connectivity and data provenance; WebSocket/browser updates, observed_at timestamp, stale data indication, LIVE/REPLAY/DEMO mode labels. If provider credentials are unavailable, clearly display DEMO and provide next steps; NEVER fabricate LIVE.
- Stage gate 3: georeferencing test; compare projection of known latitude/longitude between minimap and 3D scene with documented origin. If detailed depot geometry is unavailable, draw a clearly labeled *stylized* 3D area and do not claim exact garage slot locations.
- Stage gate 4: test in browser and compare screenshots to approved visual; include glTF asset provenance/permissions, build/logs/screenshots and state functional gaps honestly.
- State source-supported facts only. The reference has illustrative values (96% on-time, 184 buses, etc.) which MUST NOT be presented as real unless source data exists.
