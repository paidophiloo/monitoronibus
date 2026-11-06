# Fontes e repositórios oficiais — Pátio Monitor

> Pesquisa pública revisada em 5/11/2026. Estas referências fundamentam **escolhas técnicas**; não provam que credenciais privadas ou integrações estão disponíveis em produção.

## Dados e geografia
- SPTrans Olho Vivo, documentação oficial v2.1: https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/
- SPTrans Developer GTFS estático e login: https://www.sptrans.com.br/desenvolvedores/
- GTFS Schedule/`shapes.txt` (local da rota, não estacionamento no pátio): https://gtfs.org/documentation/schedule/reference/
- GTFS Realtime Vehicle Position spec: https://gtfs.org/documentation/realtime/feed-entities/vehicle-positions/
- OpenStreetMap Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- OSM licença ODbL e atribuição: https://www.openstreetmap.org/copyright
- SPTrans áreas de operação com cores de identidade territorial: https://prefeitura.sp.gov.br/w/servico/estrutura

## Renderização e assets
- React Three Fiber v9 e React19: https://r3f.docs.pmnd.rs/
- R3F performance: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- R3F `useFrame` e o que não fazer: https://r3f.docs.pmnd.rs/api/hooks
- GLTFLoader oficial (Draco/Meshopt/KTX2): https://threejs.org/docs/pages/GLTFLoader.html
- glTF Transform CLI optimize: https://gltf-transform.dev/
- Blender glTF 2.0 export: https://docs.blender.org/manual/en/dev/addons/scene_gltf2.html
- MapLibre JS e 3D: https://maplibre.org/projects/gl-js/
- MapLibre Examples (3D buildings/Three.js): https://maplibre.org/maplibre-gl-js/docs/examples/
- deck.gl com MapLibre: https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- deck.gl `ScenegraphLayer` 3D: https://deck.gl/docs/api-reference/mesh-layers/scenegraph-layer

## Código existente para estudar — NÃO copiar cegamente
- Mini Tokyo 3D demo: https://minitokyo3d.com/
- Mini Tokyo 3D GitHub, licença MIT: https://github.com/nagix/mini-tokyo-3d
- Mini Amsterdam 3D GitHub: https://github.com/AzyAli/mini-amsterdam-3d
- ETRA Electra / EMT Madrid: https://www.grupoetra.com/emt-madrid/
- Exemplo terminal 3D+MQTT HSL Helsinque: https://www.ifcvieweronline.eu/blog/bus-terminal-digital-twin-mqtt/

## Codex
- Codex CLI e `AGENTS.md`: https://learn.chatgpt.com/docs/codex/cli
- Boas práticas de Codex: https://learn.chatgpt.com/docs/learn/best-practices

## Regras de utilização
- O MIT do Mini Tokyo cobre seu **código**, não autoriza automaticamente redistribuir dados GTFS privados, imagens, logos e tiles de terceiros.
- Screenshots em `references/` são do usuário e são referências para direção artística; **não são assets** para shipping.
- OSM necessita crédito; tiles possuem termos adicionais próprios.
- Não afirmar arquitetura proprietária interna da ETRA ou de outras soluções com base em screenshots.
