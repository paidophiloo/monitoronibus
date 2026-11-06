# Pátio Monitor

Visualização 3D de operações de ônibus para equipes de mobilidade urbana. O primeiro recorte mostra um pátio paulistano ilustrativo com oito ônibus autorais. Arraste para orbitar, arraste com o botão direito para deslocar e use a roda ou os controles para aproximar. Clique em um ônibus ou abra a lista para selecioná-lo. O painel oferece foco, vista de perfil e vista superior.

## Executar

Para usar o DEMO e a revisão de turno, execute na pasta que contém o `package.json`. Use Node 24, pnpm 11.25.0 e um navegador com WebGL 2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

No PowerShell, use `pnpm.cmd` se a execução de scripts estiver bloqueada. Abra o endereço da linha `Local` impresso pelo Vite.

Para ativar os modos de GPS LIVE e REPLAY, inicie também o backend em outro terminal com Python 3.12.

```sh
python -m pip install -r services/api/requirements-dev.txt
python -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000
```

Para o build, execute `pnpm build`. O Vite encaminha REST, WebSocket e health check ao FastAPI na mesma origem. O FastAPI desta entrega usa **um processo** para manter uma sessão e um coletor upstream.

## Simulação operacional

No **DEMO**, o relógio parte das 06h e percorre um cenário determinístico de 90 segundos simulados. Os ônibus GLB percorrem as vias do pátio, passam pela portaria e retornam à baia. O diário registra as passagens no instante em que o veículo cruza a portaria. O controle permite pausar, avançar no tempo, recomeçar e escolher 1×, 2× ou 4×. A preferência de movimento reduzido inicia o relógio pausado. A revisão de turno também pausa a movimentação para facilitar a inspeção.

O entorno e a operação são ilustrativos. As posições de **LIVE** seguem as observações geográficas recebidas. **REPLAY** usa a captura assinada. Esses modos preservam as horas da fonte e operam separadamente do relógio da simulação.

## Fechamento de turno

Abra **Revisar turno** no painel lateral para experimentar a fila com dados sintéticos identificados. Selecione uma saída para consultar escala, portaria e posição disponível na cena. Registre uma conclusão e exporte a revisão. O CSV de exportação registra a leitura de portaria e a decisão humana em campos separados.

O conjunto de demonstração da revisão é um caso de conciliação próprio, separado do diário gerado pela simulação 3D.

Para revisar seus dados, carregue um par de CSVs UTF-8 com vírgula ou ponto e vírgula. O painel oferece modelos de ambos.

| Arquivo | Colunas obrigatórias | Coluna opcional |
|---|---|---|
| Escala | `trip_id,vehicle_id,planned_at` | `route` |
| Portaria | `event_id,vehicle_id,observed_at,direction` | `trip_id` |

Use um identificador de veículo consistente nos dois arquivos, IDs únicos por saída/evento e datas ISO 8601 com fuso, como `2026-11-06T06:00:00-03:00`. A escala deve conter um único turno, com intervalo inferior a 24 horas. A direção da portaria é `IN` ou `OUT`. Um arquivo de portaria com apenas o cabeçalho representa ausência de registros.

Se os CSVs tiverem cabeçalhos próprios, a revisão abre o mapeamento de colunas. Use a prévia e confirme as correspondências ou aplique as sugestões por arquivo. Para horários como `06/11/2026 06:00`, escolha explicitamente o offset indicado pela operação. Horários ISO com offset conservam o original. No modo com mapeamento, o campo de direção também aceita `Entrada` e `Saída`. Os dois arquivos ainda precisam usar o mesmo identificador de veículo e pertencer à mesma garagem e ao mesmo turno.

- **Vínculo por saída.** Um registro `OUT` com `trip_id` tem prioridade. Registros duplicados para a mesma saída, veículo diferente da escala ou horário fora de −60 a +180 minutos aparecem como divergências.
- **Vínculo por veículo e horário.** Sem `trip_id`, a janela é de −15 a +60 minutos. O vínculo exige um candidato único em ambos os sentidos. Acima de cinco minutos de atraso, a saída vinculada aparece como atrasada. Mais de cinco minutos de antecedência exige revisão.
- **Evidência.** A passagem é confirmada pelo registro de portaria aceito na conciliação. A observação GPS complementa a investigação. Uma saída da garagem é distinta do início da viagem comercial. Uma saída sem registro suficiente permanece sem confirmação.

Os arquivos de entrada são processados no navegador. As conclusões são locais ao perfil do navegador e ao conjunto de dados. Para reabrir sem reimportar, use **Guardar turno neste navegador**. O histórico guarda apenas os campos necessários à revisão. **Excluir turno** remove os registros guardados e as conclusões correspondentes após confirmação. A opção de reimportar os mesmos arquivos, com o mesmo mapeamento quando houver, também recupera as conclusões. Exporte a revisão para guardá-la fora do navegador.

## Modos de dados

| Modo | Origem | Estado desta entrega |
|---|---|---|
| DEMO | Cenário e frota sintéticos, identificados na tela | Disponível sem credenciais e sem rede externa |
| LIVE | SPTrans Olho Vivo, servidor FastAPI e recorte do perímetro fornecido | Adaptador e conexão de UI implementados. Autenticação e cobertura real pendentes |
| REPLAY | Captura histórica validada e assinada pelo operador | Leitura e busca temporal implementadas. Sem captura histórica fornecida |

Para LIVE, configure **somente no processo FastAPI** a credencial via `SPTRANS_TOKEN` ou `SPTRANS_TOKEN_FILE` e defina `PATIO_AREA_FILE`. A variável opcional `SPTRANS_COMPANY_ID` escolhe a consulta de garagem por empresa. A credencial é emitida no [DevPlace da SPTrans](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/). O arquivo de área é JSON com `name`, `source`, `origin` e `ring`. Use pares `[longitude, latitude]` em WGS84 e feche o anel repetindo o primeiro ponto. Registre fonte e licença do perímetro. GPS e perímetro usam a mesma projeção UTM 23S, em metros.

Para REPLAY, configure `PATIO_REPLAY_FILE` e `PATIO_REPLAY_KEY` no servidor. O JSON contém `version: 1`, `source: "sptrans_olhovivo"`, `area` e `observations`, com os campos descritos em [contrato](packages/contracts/README.md). Um arquivo companheiro com sufixo `.json.sig` contém o HMAC-SHA256 hexadecimal dos bytes originais do JSON. Use uma chave privada de pelo menos 32 bytes e assine apenas dados com procedência já verificada. A timeline usa as leituras registradas e mantém seus horários originais.

Os modos de GPS mostram somente a área configurada e posições observadas. O pátio cenográfico é exclusivo do DEMO. O aplicativo não atribui a observações GPS uma baia, direção, telemetria de manutenção ou autorização de saída.

## Execução em contêiner local

Com Docker Compose, crie `runtime-data` na raiz e execute `docker compose up --build`. Abra `http://127.0.0.1:8080`. O Caddy publica a interface apenas no loopback, encaminha a API e faz a atualização WebSocket na mesma origem. Os processos usam UID 10001, sistema de arquivos de contêiner somente leitura e nenhuma capability adicional.

Para ativar LIVE nessa configuração, coloque o token e o perímetro em `runtime-data`, com permissões de leitura para o UID 10001. Copie `.env.example` para `.env` e defina `SPTRANS_TOKEN_FILE=/run/patio/sptrans-token.txt` e `PATIO_AREA_FILE=/run/patio/area.json`. O diretório é montado somente para leitura na API. A interface recebe apenas as observações normalizadas.

O perfil Compose é local. Uma implantação remota exige TLS, autenticação de acesso à aplicação e configuração de `PATIO_PUBLIC_ORIGIN` conforme a origem HTTPS real.

## Testar e regenerar

```sh
(cd services/api && python -m pytest -q)
pnpm build
pnpm --filter @patio/web exec playwright install chromium
pnpm test
blender -b -t 2 -P assets/build_bus.py
```

Os testes de navegador iniciam a API offline em 8000 e o frontend de produção em 4174. Feche processos locais que estejam usando essas portas antes de testar. Use `CHROMIUM_PATH` para um executável Chromium de testes previamente instalado. As capturas ficam em `docs/qa`. A procedência e licença do ônibus estão em [models/LICENSE.md](apps/web/public/models/LICENSE.md).

## Escopo operacional

O build contém câmera, inspeção de malha, sessão SPTrans server-side, polling compartilhado, deduplicação por prefixo, projeção métrica e replay assinado. A sessão usa HTTPS, timeout, renovação após 401/403 e espera crescente em falhas. O canal `/api/vehicles/live` transmite os snapshots aos navegadores conectados e limita a origem e o número de conexões. A interface recupera dados por HTTP enquanto tenta restabelecer o canal. Observações antigas mantêm o horário original e aparecem sinalizadas.

Permanecem pendentes para operação institucional a validação de um pátio real e da cobertura GPS, modelo georreferenciado, persistência PostgreSQL/PostGIS, retenção, autenticação da plataforma, observabilidade e testes em dispositivos de operadores. O blueprint original registra os marcos de implementação e as integrações restantes. Para a referência visual, use `references/00-APPROVED-visual-target.png` do handoff v3.
