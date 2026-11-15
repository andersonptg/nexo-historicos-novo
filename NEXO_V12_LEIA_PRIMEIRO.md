# NEXO V12.1 — correção do instalador

Esta revisão corrige a validação do trecho `b.mode==='link'` em `worker/src/adm.js`: a versão instalada usa **três espaços de indentação**, enquanto o instalador V12 original exigia quatro. O erro `endpoint pedra: esperado um trecho, encontrado 0` era uma incompatibilidade do instalador e interrompia a instalação antes de mudar o projeto. Nenhuma correção no banco de dados é necessária.

Use o arquivo `INSTALAR_NEXO_V12.py` **deste pacote** em um diretório novo. Para conferir sem alterar nada: `python INSTALAR_NEXO_V12.py --verificar`; depois instale sem o argumento. Backup e rollback local estão incluídos; a publicação na Cloudflare é manual.

---

# NEXO V12 — Sinais exclusivos, pedra configurável, bolinhas, tempo da fonte e placar

**Projetado como atualização incremental de `~/nexo_novo_v1` após a V11.** O programa compara trechos exatos antes de alterar os arquivos; se encontrar versão diferente, interrompe sem fazer mudanças. A V11 deve ter sido instalada e ter passado nos testes locais, conforme informado pelo usuário.

## Instalação no Android (Aba 2 do Termux)

1. Baixe `NEXO_V12_SINAIS_RAPIDOS_VISUAL_COMPLETO.zip` em **Downloads**.
2. Cole **somente** os comandos a seguir na Aba 2:

```bash
mkdir -p ~/nexo_v12_instalador
unzip -o ~/storage/shared/Download/NEXO_V12_SINAIS_RAPIDOS_VISUAL_COMPLETO.zip -d ~/nexo_v12_instalador
python ~/nexo_v12_instalador/INSTALAR_NEXO_V12.py
```

Para conferir compatibilidade antes, execute `python ~/nexo_v12_instalador/INSTALAR_NEXO_V12.py --verificar`. A instalação local cria `~/NEXO_V12_BACKUP_ANTES_*.zip`, verifica sintaxe JS, roda **todos** os testes Node e, se falhar, restaura os arquivos originais. Não altera banco SQLite, motor Python, secrets, R2, bot ou GitHub. **Não publica automaticamente** a versão.

**Depois de instalar:** envie a saída do Termux; revise `git diff --stat` e `git diff --check`. Não use `git add .` sem inspecionar os arquivos. A publicação via GitHub Actions só deve acontecer depois de confirmar o que será alterado e de desativar o bot no ADM durante a transição.

## Mudanças

### Telegram

- Cada evento envia **OU** texto **OU** sticker **OU** GIF. Mídia selecionada não recebe mensagem de texto duplicada. GALE 1 e GALE 2 continuam apenas texto.
- A pedra sorteada é uma **mensagem separada e opcional** depois do WIN/RED, com campo de texto próprio e opção global ligar/desligar, mais opção por estratégia. O link de cadastro mantém-se em mensagem separada após o encerramento.
- O controle de ciclo único e a fila de entregas incertas da V11 continuam. Os grupos recebem independentemente e a sequência dentro de cada grupo é preservada em processamento normal. Uma entrega incerta pode precisar de conferência manual; **não existe garantia matemática de entrega instantânea nem exatamente-uma-vez pelo Telegram**.
- Cache de verificação de permissões em grupo aumentado de 45 a 180 segundos para reduzir chamadas de API desnecessárias; mudanças de permissões podem demorar até três minutos para nova validação automática.
- Lotes com mais de três sequências inéditas, lacuna de sequência superior a três ou rodada da fonte com mais de 150 segundos são classificados como **recuperação**, não geram sinais e reinicializam o cursor sem apagar histórico. O limiar é conservador para evitar enxurradas; em condições de fonte lenta pode suprimir um sinal legítimo em vez de enviá-lo atrasado.

### Site público

- Bolinhas redondas e legíveis, com cores e números preservados.
- Cartão de **resultado confirmado** acende quando chega um ID novo. O aviso “BRABET GIROU” indica que **o resultado foi recebido**, não que a API detectou o início ou fim do giro.
- Animação leve de fogos por **10 segundos**, só quando um novo resultado branco é observado com a página aberta; reduzida/desligada se o dispositivo pedir redução de movimento. Não usa imagens pesadas.
- Evita reconstruir centenas de bolinhas no DOM quando o resultado não mudou, reduzindo travamentos em celular.
- Deixa de mostrar “ao vivo” quando a rodada está atrasada por dois minutos ou mais.

### ADM

- Aba **Mensagens**: campo fixo “Pedra sorteada”, checkbox, texto até 400 caracteres, salvamento individual; variáveis `{quadrado_espaco}`, `{quadrado}`, `{pedra}`, `{numero}`, `{cor}`, `{hora}` e `{estrategia}`.
- Formatos exclusivos de mensagem: Texto / Sticker / GIF. O controle antigo de anexar duas formas de mídia fica oculto e o Worker desconsidera `sendWithMedia` antigo.
- Aba **Estratégias**: vitrine dos padrões salvos em bolinhas, botão Visualizar e Editar e checkbox para permitir a pedra naquela estratégia.
- Aba **Placares**: painel de indicadores WIN, BRANCO, RED, GALE 1/2, entradas e taxa de ciclos concluídos; preserva controles existentes de reset e compartilhamento.

## Limites reais e segurança

A fonte atualmente usada (`historicosblaze.com/results/brabet/double`) publica resultados com precisão de **minuto**, sem evento comprovado de giro nem webhooks. A coleta Termux usa intervalo-alvo de 1 segundo, mas **não é possível prometer atualização em milissegundos** após a roleta, nem entrega Telegram sem latência. Não exibimos resultados inventados durante a espera.

A sincronização Cloudflare já havia sido normalizada nesta conversa, mas é independente das mudanças desta V12. Depois do deploy, valide `GET /api/health`, `GET /api/history`, sessão ADM, seleção de grupos, sticker isolado, resultado branco e ausência de notificações atrasadas antes de reativar os sinais reais.

O instalador não executa operações destrutivas nem publica, e inclui novos testes automatizados. Testes locais são pré-requisito, mas **não são prova de comportamento em produção**.
