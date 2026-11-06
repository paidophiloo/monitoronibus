# Pátio Monitor

Visualização 3D de operações de ônibus para equipes de mobilidade urbana. O primeiro recorte mostra um pátio paulistano ilustrativo com oito ônibus autorais. Arraste para orbitar, arraste com o botão direito para deslocar e use a roda ou os controles para aproximar. Clique em um ônibus ou abra a lista para selecioná-lo. O painel oferece foco, vista de perfil e vista superior.

## Executar

Requisitos: Node 24, pnpm 11.25.0, Python 3.12 e navegador com WebGL 2.

```sh
pnpm install --frozen-lockfile
python -m pip install -r services/api/requirements-dev.txt
python -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000
```

Em outro terminal:

```sh
pnpm dev
```

Abra o URL impresso pelo Vite. Para o build, execute `pnpm build`. Em um deploy, sirva `apps/web/dist` e encaminhe `/api` e `/health` ao FastAPI na mesma origem. O Vite já faz esse proxy em dev e preview. O FastAPI desta entrega usa **um processo** para manter uma sessão e um coletor upstream.

## Modos de dados

| Modo | Origem | Estado desta entrega |
|---|---|---|
| DEMO | Cenário e frota sintéticos, identificados na tela | Disponível sem credenciais e sem rede externa |
| LIVE | SPTrans Olho Vivo, servidor FastAPI e recorte do perímetro fornecido | Adaptador e conexão de UI implementados. Autenticação e cobertura real pendentes |
| REPLAY | Captura histórica validada e assinada pelo operador | Leitura e busca temporal implementadas. Sem captura histórica fornecida |

Para LIVE, configure **somente no processo FastAPI** as variáveis `SPTRANS_TOKEN` e `PATIO_AREA_FILE`. A variável opcional `SPTRANS_COMPANY_ID` escolhe a consulta de garagem por empresa. A credencial é emitida no [DevPlace da SPTrans](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/). O arquivo de área é JSON com `name`, `source`, `origin` e `ring`. Use pares `[longitude, latitude]` em WGS84 e feche o anel repetindo o primeiro ponto. Registre fonte e licença do perímetro. GPS e perímetro usam a mesma projeção UTM 23S, em metros.

Para REPLAY, configure `PATIO_REPLAY_FILE` e `PATIO_REPLAY_KEY` no servidor. O JSON contém `version: 1`, `source: "sptrans_olhovivo"`, `area` e `observations`, com os campos descritos em [contrato](packages/contracts/README.md). Um arquivo companheiro com sufixo `.json.sig` contém o HMAC-SHA256 hexadecimal dos bytes originais do JSON. Use uma chave privada de pelo menos 32 bytes e assine apenas dados com procedência já verificada. A timeline usa as leituras registradas e mantém seus horários originais.

Os modos de GPS mostram somente a área configurada e posições observadas. O pátio cenográfico é exclusivo do DEMO. O aplicativo não atribui a observações GPS uma baia, direção, telemetria de manutenção ou autorização de saída.

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

O build contém câmera, inspeção de malha, sessão SPTrans server-side, polling compartilhado, deduplicação por prefixo, projeção métrica e replay assinado. A sessão usa HTTPS, timeout, renovação após 401/403 e espera crescente em falhas. Observações antigas mantêm o horário original e aparecem sinalizadas.

Permanecem pendentes para operação institucional a validação de um pátio real e da cobertura GPS, modelo georreferenciado, WebSocket, persistência PostgreSQL/PostGIS, retenção, autenticação da plataforma, observabilidade e testes em dispositivos de operadores. O blueprint original registra os marcos de implementação e as integrações restantes. Para a referência visual, use `references/00-APPROVED-visual-target.png` do handoff v3.
