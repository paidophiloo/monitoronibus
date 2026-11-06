# Prompt for ChatGPT Work (attach this ZIP)

Build **Pátio Monitor**, a serious 3D bus-fleet visualization application, from the specifications attached. **Read the entire `AGENTS.md` and `docs/BLUEPRINT.md`, and inspect `references/00-APPROVED-visual-target.png` before coding. This image is the APPROVED visual target.**

Do not reinterpret the project as an administrative dashboard, conventional map with icons, static Web mockup, or HTML/CSS vehicle animation. I require a true WebGL 3D scene built with Three.js + React Three Fiber, genuine licensed/custom authored GLB bus meshes (windscreen, windows, doors, wheels, roof and realistic proportions), camera control/selection, São Paulo-style stylized buildings and roads, and clean Portuguese interface. Use HTML/CSS only for HUD UI.

Required data provenance: read real position data from SPTrans Olho Vivo server-side only when authorized, preserve observation timestamps, render visibly different LIVE / REPLAY / DEMO modes, freeze/label stale observations and never invent bus positions, depot slots, maintenance, on-time rates or fuel. If credentials are unavailable, show a clearly labeled DEMO and specify how to connect LIVE; do not state it is real-time. Avoid using fictional statistics copied from the reference image.

GitHub: first verify your environment can EDIT, COMMIT, and PUSH to the intended repo. Reading the GitHub plugin is NOT proof of write access. If you only have read-only access, do not promise push; create the implementation in an environment that supports code edits (Codex, local folder or runnable Work development environment) and explain how to transfer it.

Hosting: inspect the runtime before choosing ChatGPT Sites. Some servers/background jobs/Python services may be unsupported in Sites; if necessary use separate deployment for the Python ingestion and a web frontend. Do not silently discard the FastAPI+PostgreSQL architecture in favor of fake data.

IMPLEMENT IN VERIFIABLE SLICES:
A. Technical inventory + propose GLB source/license, real GPS API access, supported runtime, hosting and repo permissions. Do not generate UI first.
B. One real `.glb` bus on a Three.js/R3F scene with camera orbit, hover and click selection. Screenshot from RUNNING BROWSER + asset provenance; no placeholder cubes as final.
C. Mini São Paulo-styled depot scene occupying most of the viewport with clean shell faithful to the approved screenshot. Test frame rendering and interactions.
D. Provider connector backend, live position updates/replay if accessible, source timestamps, fallback DEMO and tests.
E. Integrate other GS FIAP subject components only when genuine, not mock placeholders.

ACCEPT ONLY when the preview actually moves the camera around a textured 3D model, an ID can be clicked, data timestamps are shown, status mode is truthful, and the app has build/test results plus screenshots. If any requirement is blocked, explicitly report blocker rather than substitute a flat imitation.

First response: provide feasibility, permissions, real-vs-demo constraints, and plan for the first vertical slice. Then produce that slice in the current task if environment supports it.
