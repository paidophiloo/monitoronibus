# Direção visual e arquitetura da primeira entrega

A referência aprovada define a composição. A maquete ocupa o centro, com navegação curta à esquerda e contexto do veículo à direita. No mobile o 3D vem antes da ficha e a lista continua acessível pelo ícone de frota. As referências de jogo orientam a leitura de baias e a seleção direta, a logística isométrica orienta a luz diurna e ELECTRA orienta o posicionamento espacial do contexto.

| Elemento | Decisão |
|---|---|
| Marca | Pátio Monitor · Mobilidade urbana |
| Base | Papel `#FBFCF8`, fundo `#F2F4F0` e texto `#182B26` |
| Interação | Verde `#126346`, foco espacial menta e âmbar para atenção à origem dos dados |
| Tipografia | Plus Jakarta Sans Variable na UI e IBM Plex Mono para códigos |
| Ícones | Lucide em SVG |
| Mundo 3D | Maquete diurna autoral, superfícies PBR, sombras, perspectiva ortográfica e enquadramento de 3/4 |

## Decisões técnicas

- **Cena** usa React Three Fiber para entrada e composição. Three.js carrega o GLB e reusa a malha do ônibus entre instâncias. Renderização sob demanda evita redesenhar a vista parada. As imagens do handoff ficam fora do build. [R3F, Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) · [Three.js, GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- **Modelo** foi construído e exportado em Blender, com geometria própria para o para-brisa, aros, pneus, portas e acabamento da carroceria. As dimensões estão em metros e a pintura é ilustrativa. [Blender, glTF 2.0](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- **Localização** preserva longitude, latitude e horário original da observação. O recorte métrico usa UTM 23S e aplica a mesma transformação ao perímetro e aos veículos. A cena dos modos de GPS contém apenas o perímetro configurado. O pátio construído para a DEMO é independente.
- **Dados** ficam atrás de um adaptador server-side com sessão autenticada. A consulta de garagem usa código de empresa. Um perímetro geográfico, quando disponível, é aplicado como filtro separado. [SPTrans, documentação Olho Vivo](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/)
- **Estudo de referência** Mini Tokyo 3D ilustra a separação entre a representação espacial e as fontes de operação. O desenho do Pátio Monitor usa câmera e geometria próprias. [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d)
- **Implantação** o build web é estático e o FastAPI requer um processo Python separado. A entrega roda localmente com proxy de mesma origem. A persistência PostgreSQL/PostGIS e o transporte WebSocket previstos no blueprint ficam para a próxima etapa de infraestrutura. Nesta entrega o navegador lê um snapshot compartilhado.
