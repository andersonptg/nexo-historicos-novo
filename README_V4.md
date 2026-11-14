# NEXO HISTÓRICOS V4 — Histórico inicial + bot cadastrado no próprio ADM

Atualização V4 do **novo** repositório `andersonptg/nexo-historicos-novo`. O motor Termux, a coleta Brabet, o histórico diário e os objetos existentes em `nexo-v1/games/` NÃO são modificados. As preferências ADM continuam sob `nexo-v3/`, e a senha ADM já configurada continua válida.

## Resumo da navegação

- **Página principal `/`**: histórico Brabet Double, pedras quadradas de cantos arredondados, filtros e dias. No cabeçalho **⋮ → Entrar no ADM** (é o menu do SITE, não o `⋮` do navegador).
- **`/adm.html`**: painel administrativo V4, menu lateral para Estratégias, Mensagens, Pedras, Stickers/GIFs, Telegram/Grupos, Placares e Configurações.
- **Estratégias**: SEM GALE / GALE 1 / GALE 2 escolhidos manualmente; textos específicos de PRETO e VERMELHO, bot OFF por padrão. Uma paleta permite inserir cor, coringa e números exatos no padrão.
- **Telegram/Grupos**: campo de token protegido, validação `getMe`, criptografia AES-GCM no R2 com chave de segurança configurada como Secret Cloudflare, webhook registrado automaticamente **somente** se não houver webhook de outro sistema, vinculação do ADM no privado do bot, detecção de grupos novos em que o bot é ADM.
- **Biblioteca**: envie figurinhas ou GIFs **no privado do bot vinculado**; o site recebe `file_id` e apresenta na biblioteca, com seleção do formato Sticker / GIF / Texto em cada evento da estratégia. Upload manual de PNG/WEBP/GIF continua disponível.

## Instalação segura usando Aba 2 do Termux

1. Salve `NEXO_V4_ADM_HISTORICO_TELEGRAM.zip` em Downloads.
2. Aba 1: não mexa. Aba 2:

```bash
mkdir -p ~/nexo_v4_instalar
unzip -o ~/storage/downloads/NEXO_V4_ADM_HISTORICO_TELEGRAM.zip -d ~/nexo_v4_instalar
python ~/nexo_v4_instalar/INSTALAR_V4.py
```

O instalador valida o repositório, recusa alterações locais inesperadas nos arquivos afetados, faz backup ZIP dos arquivos e uma cópia consistente do SQLite, modifica apenas a interface/ADM e executa testes. Não publica nem liga o Telegram.

Se aparecer `NEXO V4 INSTALADA E TESTADA LOCALMENTE`, na Aba 2:

```bash
cd ~/nexo_novo_v1
git add -- worker/src/adm.js worker/public/index.html worker/public/app.js \
  worker/public/style.css worker/public/adm.html worker/public/adm.js \
  worker/public/adm.css tests/v4.test.js README_V4.md
git diff --cached --stat
git commit -m "NEXO V4 - historico e bot no ADM" && git push origin main
```

O GitHub Actions continua **manual**: `https://github.com/andersonptg/nexo-historicos-novo/actions/workflows/publicar.yml` → **Run workflow** branch `main`. Espere o teste passar e o deploy terminar. Não execute `git add .` e nunca publique `.config`, segredos ou bancos.

## Uma configuração privada de segurança na Cloudflare (obrigatória)

Para salvar o bot pelo ADM sem armazenar token legível no R2, configure um Secret `NEXO_BOT_ENCRYPTION_KEY` no **Worker novo** `nexo-historicos-novo`:

```bash
umask 077
mkdir -p ~/.config/nexo_v4
python - <<'PY'
from pathlib import Path
import secrets
p=Path.home()/'.config/nexo_v4/encryption_key'
if not p.exists():p.write_text(secrets.token_urlsafe(48)+'\n')
p.chmod(0o600)
print('Chave de criptografia gerada/preservada. Valor oculto.')
PY
```

No Cloudflare → Workers e Pages → `nexo-historicos-novo` → Configurações → Variáveis e Segredos → **Adicionar**: tipo **Segredo**, nome `NEXO_BOT_ENCRYPTION_KEY`, valor exatamente o conteúdo do arquivo `~/.config/nexo_v4/encryption_key`, ambiente Produção. Cole privadamente (não envie fotos/chats da chave). Se quiser copiar sem exibir, tendo Termux:API configurado:

```bash
termux-clipboard-set < ~/.config/nexo_v4/encryption_key
```

**Não altere essa chave depois que salvar o bot**, pois os tokens criptografados existentes deixarão de poder ser abertos. Guarde cópia privada. Não é o token do bot nem `NEXO_V1_INGEST_TOKEN`.

## Cadastro e confirmação bonita no Telegram

1. Abra `https://nexo-historicos-novo.lipesanderson.workers.dev/adm.html` e entre com a senha ADM já existente.
2. Menu **Telegram e grupos** → cole o token do **BotFather** no campo **Cadastrar meu robô** → **Validar e salvar bot**. A API verifica o token antes de guardar somente a versão criptografada no R2. O token NÃO volta no retorno e o navegador limpa o campo.
3. Se o bot ainda não conhece seu chat privado, ele não pode iniciar uma conversa com você. Clique **Gerar código de vinculação** e envie `/vincular CODIGO` no chat privado com seu bot (10 minutos). O bot responderá automaticamente:

> 🟢 ROBÔ CADASTRADO COM SUCESSO!  
> ✅ @SeuBot conectado ao NEXO HISTÓRICOS.  
> 🔐 Cadastro protegido.  
> 📥 Envie stickers ou GIFs aqui para aparecerem na biblioteca do painel.  
> ⚙️ Os sinais permanecem DESLIGADOS até você ativá-los no ADM.

4. Depois que seu privado estiver vinculado, o botão **Salvar bot** enviará a confirmação novamente automaticamente.
5. Envie um sticker ou GIF no privado do bot; vá a **Stickers e GIFs → Atualizar biblioteca**; selecione **Usar em mensagem**. Na tela Mensagens escolha a estratégia e evento (ATENÇÃO, WIN, RED, BRANCO, GALE etc.), ajuste texto, formato e pressione **Salvar mensagem**. A escolha não ativa sinais.

### Grupos automáticos

- O bot deve estar **ADM** no grupo ou canal, com permissão de publicação.
- Com webhook do **novo NEXO** ativo, `my_chat_member` identifica novos grupos onde o bot é adicionado ou promovido.
- Para grupos que já existiam, envie `/nexo_grupo` no grupo e toque **Atualizar grupos**; o Telegram não oferece lista retroativa completa de todos os grupos do bot.
- Marque as caixinhas apenas dos grupos desejados e **Salvar grupos selecionados**. Até 5 grupos por vez; nunca seleciona automaticamente.
- Se o bot ainda usa um webhook de outro Worker (NEXO antigo), a V4 **não substitui ou desativa** o webhook. Desative o sistema antigo e planeje a migração antes de usar Registrar webhook. Nenhum sinal é enviado durante o cadastro.

## Segurança e limites

- Só o usuário com sessão ADM autenticada pode cadastrar ou consultar status. Token do bot criptografado em `nexo-v3/telegram/bot-encrypted.json`, com chave que só existe no Secret do Worker. Uma base R2 não deve conter seu token em texto legível.
- Biblioteca salva `file_id` do Telegram, não o token. Preview é obtido via endpoint autenticado, sem colocar o token no HTML.
- O chat privado fica vinculado por comando aleatório de 10 minutos. Outros remetentes não conseguem adicionar mídias.
- **Não ativar envios** até validar estratégias, mídias e grupos; o bot antigo pode continuar operando se não foi desativado.
- A confirmação real, a descoberta de grupos e os envios só podem ser validados depois de publicar e configurar o segredo no seu ambiente Cloudflare e com o Telegram.
- A fonte Brabet é de terceiros, com precisão de minuto. Consultas do Termux não garantem rodada instantânea nem previsão.
- O motor fica na Aba 1, o Termux de comandos na Aba 2; histórico R2, limpeza de registros sincronizados e arquivo por dia permanecem como estavam na V2/V3.
