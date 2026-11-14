# NEXO HISTÓRICOS NOVO · V3 — Painel ADM integrado

Esta atualização adiciona `/adm.html` ao **mesmo site** Cloudflare do NEXO novo. O histórico V2, seu motor Termux, o bucket `nexo-historicos-v30`, as chaves V1 e os objetos `nexo-v1/games/` permanecem intactos. As configurações novas ficam no prefixo `nexo-v3/` dentro do mesmo R2.

## O que a V3 implementa

- Login protegido por senha privada `NEXO_ADM_PASSWORD` (Secret do Worker), sessão assinada HttpOnly, controle básico de tentativas e APIs administrativas protegidas.
- Menu no **mesmo site**, com telas: Visão Geral, Estratégias, Mensagens, Pedras, Stickers e GIFs, Telegram/Grupos, Placares e Configurações.
- Criar/editar/pausar/arquivar estratégias com sequência de cores/números/coringa, alvo PRETO+BRANCO ou VERMELHO+BRANCO, Gale **0, 1 ou 2 selecionado manualmente**, prévia de simulação, sem mensagens preenchidas automaticamente.
- Cada estratégia tem textos separados para: ATENÇÃO, ENTRADA PRETO, ENTRADA VERMELHO, GALE 1, GALE 2, WIN PRETO, WIN VERMELHO, WIN BRANCO e RED. Todas as mensagens podem ser editadas e salvas a qualquer momento.
- Por evento, selecionar **um formato**: só texto, sticker ou GIF. O texto é enviado antes da mídia. Opcionalmente incluir a pedra/número antes do sticker/GIF no texto do resultado.
- Upload privado de PNG/WEBP como sticker (até 512 KB) e GIF (até 5 MB) em R2. Por favor, prepare os stickers com até 512 px no maior lado e fundo transparente.
- Grupos/canais descobertos via webhook `my_chat_member` ou comando `/nexo_grupo` após o bot ser ADM; seleção por caixa + Salvar, até cinco grupos. **Não existe API Telegram para listar todos os grupos antigos retroativamente.**
- Ativação explícita do bot, disparo de ATENÇÃO se houver estratégia ativa, mensagem de teste, placares separados por estratégia, zerar manualmente e reset após meia-noite de Brasília via cron Worker a cada minuto.
- Histórico público continua recebendo novos dados do Termux. O site mostra as pedras em quadradinhos de cantos arredondados; há opção ADM para ocultar números em todos os resultados exibidos.

## O que NÃO deve ser considerado testado no seu ambiente ainda

O código passou nos testes automatizados locais, mas **não foram feitos envios reais ao seu bot, testes de webhook real nem deploy na sua conta**. Você deve validar o ADM e a simulação antes de habilitar o bot. Se uma mensagem é enviada mas ocorre uma falha de rede antes da confirmação da API do Telegram, uma tentativa posterior pode duplicá-la — a API Telegram não fornece uma transação exatamente uma vez.

Não há promessa de previsão de cor. As regras apenas reagem às rodadas já publicadas pela fonte de terceiros, com precisão de minuto e eventuais atrasos.

## Instalar na ABA 2 do Termux

Salve `NEXO_V3_ADM_COMPLETO.zip` em Downloads:

```bash
mkdir -p ~/nexo_v3_instalar
unzip -o ~/storage/downloads/NEXO_V3_ADM_COMPLETO.zip -d ~/nexo_v3_instalar
python ~/nexo_v3_instalar/INSTALAR_V3.py
```

O instalador exige encontrar o projeto em `~/nexo_novo_v1`, compara a versão atual com o código V2 enviado ao GitHub, **cria backup dos arquivos afetados e uma cópia consistente do SQLite**, aplica só os arquivos de V3 e executa testes de Python/Node. Se falhar, restaura os arquivos anteriores. Não modifica `~/nexo_historicos_v5`, nem apaga históricos, nem executa deploy ou Telegram.

A **Aba 1 do Termux permanece ligada**: a coleta usa `nexo.py`, que não é modificado nesta atualização.

### Confirmar e enviar código ao GitHub

Se a instalação imprimir `V3 INSTALADA E TESTADA`, então na Aba 2:

```bash
cd ~/nexo_novo_v1

git add -- worker/src/index.js worker/src/adm.js \
  worker/public/index.html worker/public/style.css worker/public/app.js \
  worker/public/adm.html worker/public/adm.css worker/public/adm.js \
  tests/adm.test.js wrangler.jsonc README_V3_ADM.md

git diff --cached --stat

git commit -m "NEXO V3 - painel ADM integrado" && git push origin main
```

**Nunca execute `git add .` se há tokens, bancos e backups no diretório.** O push não publica automaticamente: o workflow de publicação continua sendo **manual**.

### Publicar a V3

No GitHub, abra `https://github.com/andersonptg/nexo-historicos-novo/actions/workflows/publicar.yml`, clique **Run workflow → main → Run workflow**. Confira que os testes e o deploy terminaram verdes. Não use o Worker antigo `nexo-historicos-hub`.

### Configurar a senha ADM

Gere uma senha forte **privadamente** no Termux, sem exibir o valor durante a criação:

```bash
umask 077
mkdir -p ~/.config/nexo_v3
python - <<'PY'
from pathlib import Path
import secrets
p=Path.home()/'.config/nexo_v3/adm_password'
if not p.exists():
    p.write_text(secrets.token_urlsafe(36)+'\n')
    p.chmod(0o600)
print('Senha ADM preservada ou criada com seguranca. Nao mostre em prints.')
PY
```

No Cloudflare → Worker **nexo-historicos-novo** → Configurações → Variáveis e Segredos → Adicionar, crie Secret **`NEXO_ADM_PASSWORD`** com o valor EXATO do arquivo `~/.config/nexo_v3/adm_password`.

Se houver `termux-clipboard-set` instalado, pode copiar sem imprimir na tela:

```bash
if command -v termux-clipboard-set >/dev/null 2>&1; then
  termux-clipboard-set < ~/.config/nexo_v3/adm_password
  echo 'Senha copiada para a area de transferencia Android.'
else
  echo 'Termux: use nano ou cat localmente para copiar em privado.'
fi
```

Depois abra `https://nexo-historicos-novo.lipesanderson.workers.dev/adm.html`. Cole a mesma senha no formulário. **Não cole senhas neste chat.**

### Bot Telegram e descoberta de grupos (somente em etapa posterior, com ADM testado)

Configure no **mesmo Worker novo**:

- `NEXO_TELEGRAM_BOT_TOKEN`: token existente do seu bot, copiado privadamente.
- `NEXO_TELEGRAM_WEBHOOK_SECRET`: nova sequência aleatória local, de pelo menos 16 caracteres, distinta do token e da senha ADM.

Antes de clicar **Registrar webhook**, verifique se o bot antigo não depende de webhook. Se existir outro webhook, a V3 se recusará a substituí-lo. Não use opção de exclusão de webhook sem verificar o sistema antigo.

Depois adicione o bot como administrador a um grupo (ou envie `/nexo_grupo` em um grupo com bot ADM), clique **Atualizar grupos**, selecione cada destino e **Salvar grupos selecionados**. Crie e teste uma estratégia, cadastre mensagens/mídias, confirme um grupo e só então pressione **Ativar bot e enviar ATENÇÃO**. O motor Termux continua sem acessar o token Telegram.

### Observações de segurança e teste

- Não ative o envio real até revisar os textos, escolher a mídia e confirmar que o bot tem permissão de publicar.
- O admin não usa o token de ingestão do Termux nem o `CLOUDFLARE_API_TOKEN` do GitHub como senha de login.
- Se a V3 tiver falha, o histórico V2 continuará independente; para voltar à V2, use o backup criado pelo instalador e publique novamente o Worker anterior, com testes.
- Este projeto usa regras e alertas para acompanhar resultados observados. Não prevê resultados futuros ou garante retornos.
