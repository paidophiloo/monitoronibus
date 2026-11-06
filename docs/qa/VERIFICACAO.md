# Evidência da primeira entrega

- **Cena** em WebGL 2 com Three.js e React Three Fiber 9. O GLB foi exportado no Blender e o teste inspeciona as famílias de malha.
- **Browser** Chromium headless com SwiftShader em ambiente de testes. O Chromium padrão da prévia não expôs WebGL e exibiu o fallback. SwiftShader é evidência funcional de renderização, sem certificação de desempenho em GPU de produção.
- **Capturas** `scene-first-slice.png`, `scene-mobile.png`, `bus-front-three-quarter.png`, `bus-profile.png` e `bus-top.png` foram produzidas pelo Playwright a partir da aplicação executada. A referência aprovada é usada como direção de arte e fica fora do build.
- **Visual** abertura clara com viewport dominante, identidade em verde, tipografia Plus Jakarta Sans e IBM Plex Mono, ícones Lucide, modelos em escala, marcações do asfalto e painel contextual. A primeira cena tem acabamento estilizado. A referência é mais fotorealista e tem mais detalhamento urbano.
- **API** os testes usam dados sintéticos isolados para verificar o contrato, o cookie, a autenticação, as datas, o estado desatualizado e a assinatura. Nenhuma fixture sintética é fornecida ao runtime de LIVE ou REPLAY.
- **Verificação externa** sem `SPTRANS_TOKEN` e sem perímetro verificado, o modo LIVE opera indisponível. Nenhum destino GitHub com permissão de escrita foi fornecido ou identificado. O histórico segue em Git local.

## Fechamento de turno

- **Capturas** `shift-review-demo.png` e `shift-review-mobile.png` mostram o mesmo fluxo com dados DEMO no Chromium.
- **Importação e conciliação** o Playwright cobre troca de veículo, horários fora da janela, correspondência ambígua, falta de registros, arquivos inválidos e horário com fuso. A saída de um ônibus pela portaria é uma evidência distinta da partida de uma viagem comercial.
- **Navegador** o teste percorre a lista de ocorrências, confere o foco da câmera sobre a malha 3D, registra uma conclusão, reimporta o mesmo turno após recarregar e baixa o CSV com a origem marcada. O cenário sintético é isolado de LIVE, REPLAY e dos CSVs importados.
- **Alcance** as capturas e os testes demonstram o fluxo de revisão. A cobertura das fontes de uma garagem real e a economia de tempo continuam hipóteses de piloto.

## Importação e reabertura

- A captura `shift-import-mapped.png` mostra dois arquivos sintéticos com cabeçalhos em português e mapeamento explícito. Os testes conferem datas locais com offset, preservação de prefixos com zero à esquerda e isolamento entre entrada e saída de portaria.
- O Chromium também verifica que guardar um turno é opcional, que a reabertura recupera as conclusões e que a exclusão confirmada limpa o turno e seus apontamentos. A inspeção do armazenamento verifica que o nome do arquivo original e as colunas sem uso ficam fora dos dados guardados.

## Simulação e canal LIVE

- `live-simulation-demo.png` registra o ônibus GLB em manobra. `live-simulation-events.png` registra a portaria e o diário após os cruzamentos. `live-simulation-mobile.png` cobre a versão móvel.
- Os testes acompanham a posição projetada do ônibus durante o avanço, conferem que a pausa mantém o relógio e a posição, e verificam reinício, movimento reduzido e isolamento dos modos de dados.
- O Chromium conecta ao WebSocket do FastAPI pela mesma origem e recupera a consulta HTTP quando o canal é interrompido. Os testes de API exercitam sessão, cookies, perímetro, timestamps, origem do socket e falhas do provedor com respostas controladas.
- A credencial real do Olho Vivo não estava disponível neste ambiente. O Compose foi inspecionado estaticamente. A execução em contêiner depende de Docker e a implantação remota requer uma política de acesso e TLS.
