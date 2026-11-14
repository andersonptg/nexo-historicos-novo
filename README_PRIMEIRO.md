# NEXO HISTÓRICOS V1 · Projeto novo / Brabet Double

Este projeto é separado de `~/nexo_historicos_v5`. Ele NÃO altera o Worker, os dados D1, os sinais Telegram ou os backups do NEXO antigo.

## Arquitetura

- Motor PRINCIPAL: `nexo.py` em Termux/Android. Consulta APENAS o histórico público em `https://historicosblaze.com/results/brabet/double`.
- Banco local: `~/nexo_v1_dados/historicos.sqlite3` (SQLite WAL).
- Site: `worker/public/` — visual responsivo, estatísticas, filtros de cor/número/data.
- Cloudflare Worker: `worker/src/index.js` — leitura pública e ingestão **autenticada** para o mesmo bucket R2 já criado, `nexo-historicos-v30`, mas no prefixo EXCLUSIVO `nexo-v1/games/...`.
- Arquivo de catálogo: `catalog.json` — preparado para adicionar outros jogos com novos coletores. **Cadastrar um jogo não significa que o parser desse jogo já existe.**
- Futura etapa: estratégias, bot e stickers. **Nenhum sinal é enviado nesta V1.**

## ETAPA 1 — Instalar e testar o site LOCALMENTE no Android

1. Salve o ZIP em Downloads, abra o Termux.
2. Se `~/storage/downloads` não existir, execute `termux-setup-storage` e conceda permissão. Não execute comandos de apagamento de dados.
3. Cole:

```bash
mkdir -p ~/nexo_novo_v1
unzip -o ~/storage/downloads/NEXO_HISTORICOS_NOVO_V1_BRABET.zip -d ~/nexo_novo_v1
cd ~/nexo_novo_v1
python nexo.py testar
python nexo.py preparar
python nexo.py coletar
python nexo.py site-iniciar
python nexo.py status
```

Abra **http://127.0.0.1:8765** no Chrome do PRÓPRIO celular. O site inicial funciona sem Cloudflare. Se a fonte bloquear a coleta ou mudar o layout, o sistema exibirá erro e não inventará resultados.

Para manter o coletor local funcionando:

```bash
cd ~/nexo_novo_v1
python nexo.py iniciar
python nexo.py status
```

O Android pode suspender o Termux, principalmente com bateria otimizada e tela desligada. Para parar apenas a V1:

```bash
python nexo.py parar
python nexo.py site-parar
```

## ETAPA 2 — Cloudflare R2 (somente após aprovar o site local)

O Worker já vem configurado com o bucket existente `nexo-historicos-v30`. O bucket precisa estar **na mesma conta Cloudflare** do novo Worker. R2 não requer acesso público, pois o Worker lê os objetos via binding.

- Crie um repositório GitHub NOVO para esta V1 (não faça push no repositório antigo).
- Publique o NOVO Worker com `wrangler.jsonc` da raiz do pacote via GitHub Actions (o Termux Android normalmente não executa o binário `workerd`).
- Defina o Secret **`NEXO_V1_INGEST_TOKEN`** no novo Worker. Esse Secret é DIFERENTE de `V30_INGEST_TOKEN` e `TELEGRAM_BOT_TOKEN`.
- A chave local é gerada em `~/.config/nexo_v1/ingest_token` (permissão 600). Para copiar a chave pessoalmente para o painel Cloudflare, abra o arquivo em `nano`; NUNCA envie prints/tokens no chat ou no GitHub.
- Em `~/.config/nexo_v1/site_url`, salve apenas a URL HTTPS do NOVO Worker, sem barra final. Ex.: `https://nexo-historicos-novo.SEU_SUBDOMINIO.workers.dev`.
- Teste primeiro `https://URL_DO_NOVO_WORKER/api/health` e `.../api/history` (ainda vazio). Após confirmar Secret e URL, rode `python nexo.py sync` e verifique se o site recebe as rodadas.

**Não ative envio remoto antes de configurar Secret e publicar corretamente.** Nunca ative cron de coleta no Worker novo: o motor é o Termux. A integração Telegram só virá em uma etapa posterior, sem duplicar os sinais do NEXO antigo.

## Limites e integridade

- As páginas de terceiros oferecem apenas hora e minuto, não há ID oficial de cada rodada. IDs locais são preservados usando reconciliação de sequência (LCS), mas se a janela perder toda sobreposição, o motor interrompe essa captura para não inventar continuidade.
- Na primeira coleta, até 200 resultados visíveis podem ser importados. A fonte pode atrasar ou mudar layout. Nenhum resultado é criado sem evidência no HTML.
- O R2 armazena arquivos diários, uma janela de resultados recentes e um status do motor por jogo. Os dados da V30 não são tocados.
- A V1 sincroniza lotes de até 180 registros por HTTPS. Se a rede falhar, os registros continuam em SQLite como `synced=0` até conseguir transmitir.
- A interface permite seleção de data (arquivo diário no site remoto); estratégias e stickers aparecerão nas versões seguintes.
- Coleta a cada 60 segundos para respeitar a fonte pública e evitar consultas excessivas.

## Testes e diagnósticos

```bash
cd ~/nexo_novo_v1
python nexo.py testar
python nexo.py coletar
python nexo.py status
curl -sS http://127.0.0.1:8765/api/health
curl -sS 'http://127.0.0.1:8765/api/history?game_id=brabet-double&limit=5'
```

Se quiser verificar os logs:

```bash
tail -n 30 ~/nexo_v1_dados/motor.log
```

## Organização da entrega

```
nexo_novo_v1/
├── catalog.json             # jogos cadastrados
├── engine.py                # parser, deduplicação e banco SQLite
├── nexo.py                  # comandos do Termux, sincronização e preview local
├── wrangler.jsonc           # Worker novo e binding ao R2 existente
├── package.json             # dependências Cloudflare
├── worker/
│   ├── src/index.js        # API R2/Worker
│   └── public/             # site
├── tests/                  # testes automáticos
└── README_PRIMEIRO.md
```
