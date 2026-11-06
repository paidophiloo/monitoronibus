# Evidência da primeira entrega

- **Cena** em WebGL 2 com Three.js e React Three Fiber 9. O GLB foi exportado no Blender e o teste inspeciona as famílias de malha.
- **Browser** Chromium headless com SwiftShader em ambiente de testes. O Chromium padrão da prévia não expôs WebGL e exibiu o fallback. SwiftShader é evidência funcional de renderização, sem certificação de desempenho em GPU de produção.
- **Capturas** `scene-first-slice.png`, `scene-mobile.png`, `bus-front-three-quarter.png`, `bus-profile.png` e `bus-top.png` foram produzidas pelo Playwright a partir da aplicação executada. A referência aprovada é usada como direção de arte e fica fora do build.
- **Visual** abertura clara com viewport dominante, identidade em verde, tipografia Plus Jakarta Sans e IBM Plex Mono, ícones Lucide, modelos em escala, marcações do asfalto e painel contextual. A primeira cena tem acabamento estilizado. A referência é mais fotorealista e tem mais detalhamento urbano.
- **API** os testes usam dados sintéticos isolados para verificar o contrato, o cookie, a autenticação, as datas, o estado desatualizado e a assinatura. Nenhuma fixture sintética é fornecida ao runtime de LIVE ou REPLAY.
- **Verificação externa** sem `SPTRANS_TOKEN` e sem perímetro verificado, o modo LIVE opera indisponível. Nenhum destino GitHub com permissão de escrita foi fornecido ou identificado. O histórico segue em Git local.
