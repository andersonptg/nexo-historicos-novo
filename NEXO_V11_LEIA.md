# NEXO V11 · Ciclos organizados, Telegram e pedras profissionais

## Antes de executar

Este pacote foi desenhado para o projeto `~/nexo_novo_v1` V10/V10.1 do GitHub `andersonptg/nexo-historicos-novo`. O script **não altera** `~/nexo_v1_dados`, seus arquivos SQLite e `~/.config/nexo_v1`; **não publica** Cloudflare; **não ativa** bot; **não envia** Telegram. Cria ZIP com o estado anterior de todos os arquivos alterados. Se as âncoras de código divergirem ou os testes falharem, aborta / restaura automaticamente. Não rode como root.

O problema prévio **HTTP 403 da Cloudflare** não é resolvido pelo layout nem por este pacote; primeiro confirmar credenciais/endereço/proteções. Enquanto estiver errado, o histórico remoto continua atrasado. Mantenha robô desligado e evite disparar sinais antigos.

## Instalar no Termux

Salve `NEXO_V11_CICLOS_E_TELEGRAM_COMPLETO.zip` em Downloads. Se a localização for diferente, use `find ~/storage/shared/Download -iname '*V11*.zip'`.

```bash
mkdir -p ~/nexo_v11_instalador
unzip -o ~/storage/shared/Download/NEXO_V11_CICLOS_E_TELEGRAM_COMPLETO.zip -d ~/nexo_v11_instalador
python ~/nexo_v11_instalador/INSTALAR_NEXO_V11.py
```

Se aparecer `V11 INSTALADA E TESTADA LOCALMENTE`, conferir:

```bash
cd ~/nexo_novo_v1
npm test
git diff --stat
git status --short
```

**Não faça deploy sem primeiro resolver o HTTP 403 e validar o funcionamento do Worker com ambiente de testes.**

## O que foi implementado

- **Coordenador V11 (Durable Object SQLite)**: serializa a ingestão e o cron por jogo, evitando duas requisições de Worker alterarem o mesmo estado ao mesmo tempo. Necessário publicar a nova configuração do Wrangler para estar ativo. Cloudflare oferece SQLite-backed Durable Objects no plano Free, sujeito a limites gratuitos.
- **Um ciclo por jogo**: as estratégias são avaliadas na ordem cadastrada. Enquanto uma está ativa, as outras não abrem entrada. Após WIN/RED, o ciclo é fechado. ATENÇÃO temporária preserva os mecanismos de exclusão existentes.
- **Entrega por etapas**: texto, sticker/GIF opcional, pedra sorteada e link, com identificadores e confirmação guardados no R2. Se a resposta do Telegram for ambígua, o destino é bloqueado para revisão em vez de reenviar indiscriminadamente. Outros grupos podem continuar independentes.
- **O link de cadastro é separado no fim** (após WIN/RED), nunca dentro do texto da entrada.
- **WIN NO {pedra}** (`⚫8`, `🔴3`, `⚪0`) e **pedra quadrada** (`⬛ 8`, `🟥 3`, `⬜ 0`). A variável `{quadrado}` também está disponível nas mensagens globais.
- **Configuração por evento** no ADM: caixa `Enviar sticker/GIF junto com esta mensagem` com salvamento independente da seleção da mídia. Gale continua somente texto.
- **Prévia ordenada** no editor; painel visual na aba Pedras com oito campos e os últimos 28 resultados, sem imagens pesadas; cartão público com última pedra usando o histórico já solicitado pelo app, sem chamadas extras.
- **GET `/api/adm/v11/status`**: situação das filas e dos envios incertos (requer sessão ADM). O painel oferece **Descartar pendência** após revisão manual do grupo, sem reenviar mensagens; esta ação fica registrada no R2.  **POST `/api/adm/v11/reset-cycles`** com `{"confirm":true}`: somente com bot desligado; redefine estados das estratégias no último histórico remoto e arquiva pendências antigas. É ação manual de manutenção, não é acionada pelo instalador.
- **Catchup preservado**: importações históricas (`catchup:true`) atualizam R2 sem disparar sinais e agora redefinem cursores/estados de estratégia. Não inventam rodadas ausentes.

## Limites importantes

- O Telegram e a fonte pública podem ter latência ou indisponibilidade. Nenhum software pode garantir chegada instantânea nem WIN; isso é acompanhamento histórico, não previsão garantida.
- É impossível garantir entrega exatamente uma vez na rede quando o servidor envia um pedido ao Telegram e perde a confirmação. Neste caso a V11 pausa o destino para revisão, em vez de arriscar duplicata. Revisão administrativa desse bloqueio é intencionalmente conservadora.
- O Worker deve ser testado com a migração `NexoCoordinator` antes de publicação; os testes locais não substituem um teste real da Cloudflare/Telegram.
- `git add .` é desencorajado; nunca faça commit de `.config`, `.env`, tokens, SQLite ou backups. Publicação só depois de validar e revisar `git diff`.

## Se o instalador abortar

Nenhum deploy foi realizado. O log informa qual trecho divergiu ou qual teste falhou. Se houve escrita, ele restaura todos os arquivos alterados e informa o caminho do ZIP de backup.
