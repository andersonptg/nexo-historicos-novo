# NEXO HISTÓRICOS — V2 Motor Termux em duas abas

Projeto separado do antigo NEXO V30. NÃO modifica `~/nexo_historicos_v5`, não publica automaticamente, não ativa estratégias ou Telegram.

## Arquitetura

- **Aba 1 do Termux:** o processo de coleta fica em primeiro plano, exibindo registros novos, erros da fonte e confirmações do R2. Tentativa inicial a cada **1 segundo**, não é uma garantia de recebimento em 1 segundo: depende da velocidade e da atualização efetiva da fonte de terceiros. Erros causam espera progressiva de até 60 segundos; não ultrapasse limites da fonte.
- **Aba 2 do Termux:** comandos `status`, `testar`, `site-iniciar`, `site-parar`, `parar`; não execute `coletar` ou `sync` manuais enquanto o motor já está ligado. O próprio código protege contra duplicação pelo lock.
- **SQLite do Termux:** fila de rodadas aguardando a confirmação de publicação. Falha de rede não elimina registros. Após R2 confirmar a gravação, a V2 mantém as **400 rodadas locais mais recentes** como cache para reconciliar resultados e limpar o restante já sincronizado; resultados não confirmados nunca são apagados.
- **Cloudflare:** futuro Worker novo, binding privado no R2 existente `nexo-historicos-v30` sob prefixo exclusivo `nexo-v1/games/`. Arquiva resultados automaticamente por dia civil da rodada (`America/Sao_Paulo`), incluindo os dias anteriores à meia-noite, sem depender de uma tarefa exatamente às 00:00. O dia anterior fica acessível assim que é registrado; dias só estarão completos se a fonte os disponibilizou e o motor não perdeu coletas.
- **Site:** consulta a API de histórico a cada **1 segundo** quando a aba do navegador está visível, além de seleção de arquivos diários, sem prometer a chegada do resultado antes da publicação na fonte.
- **Novos jogos:** ficam definidos no catálogo e terão seus próprios arquivos no R2. Um novo tipo de jogo exigirá coletor validado; ainda não enviamos sinais ao Telegram.

## INSTALAÇÃO V2 (sem perder banco)

A atualização não sobrescreve `catalog.json`, credenciais locais, banco de dados ou a configuração do Worker já existente. Para proteger alterações manuais imprevistas, o instalador interrompe a instalação se encontrar versões de código diferentes da V1 distribuída e da V2 desta entrega.

**Abra a Aba 2 no Termux, deixando a aba 1 antiga parada por enquanto:**

```bash
cd ~/nexo_novo_v1
python nexo.py parar
python nexo.py site-parar
```

Aguarde os processos terminarem; então:

```bash
mkdir -p ~/nexo_v2_instalacao
unzip -o ~/storage/downloads/NEXO_HISTORICOS_V2_ABAS.zip -d ~/nexo_v2_instalacao
python ~/nexo_v2_instalacao/INSTALAR_V2.py
```

O instalador faz backup ZIP dos arquivos alterados e um backup consistente do SQLite (se existir); testa o código Python. Não apaga históricos. Se falhar, tenta restaurar os arquivos anteriores.

## Como abrir as duas abas

**Aba 1 — somente motor**

```bash
cd ~/nexo_novo_v1
python nexo.py motor --interval 1
```

O motor aparece na tela enquanto trabalha. `Ctrl+C` encerra o processo, mas a fila e o histórico permanecem no SQLite.

**Aba 2 — comandos**

```bash
cd ~/nexo_novo_v1
python nexo.py status
python nexo.py testar
python nexo.py site-iniciar
```

Para abrir o site local, use:

```bash
termux-open-url http://127.0.0.1:8765/
```

Ou toque na barra de endereço do Chrome e digite exatamente `http://127.0.0.1:8765/`; não coloque na busca do Google. O site local funciona sem Cloudflare e só exibe resultados guardados no SQLite do celular.

## Verificações

Na Aba 2:

```bash
python nexo.py status
curl -sS http://127.0.0.1:8765/api/health
curl -sS 'http://127.0.0.1:8765/api/days?game_id=brabet-double'
```

Se aparecer `pending_sync` acima de zero, é porque o Worker V2 **ainda não foi publicado / configurado**. Nenhum dado será removido por causa disso. Para o site ser público, precisamos configurar o NOVO Worker Cloudflare e o Secret `NEXO_V1_INGEST_TOKEN` da chave privada `~/.config/nexo_v1/ingest_token`, e salvar sua nova URL HTTPS em `~/.config/nexo_v1/site_url` (sem colar segredo no chat). Não modifique o Worker e os secrets da V30.

## Atenção à precisão da fonte

A fonte usada `https://historicosblaze.com/results/brabet/double` fornece hora e minuto, sem ID oficial de rodada. Consultas a cada segundo não fazem a fonte produzir resultados em tempo real nem permitem inventar segundos ou milissegundos. Se a fonte limitar requisições, respeite o bloqueio. O motor desacelera diante de falhas sucessivas. O site não oferece previsões garantidas e não executa apostas.
