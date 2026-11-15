/* NEXO V12.2 — Após Pedra configurável, controle de exclusão e UX responsiva.
 * Não envia Telegram nem modifica dados sem ação explícita do administrador.
 */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
 let busy=false,dirty=false;
 function preview(){window.NEXO_V12_PREVIEW?.()}
 function buildAfterPanel(){
  const root=$('v7-global-messages');if(!root||$('v12-2-after-settings'))return;
  const box=el('section','v12-2-after-settings');box.id='v12-2-after-settings';
  box.append(el('div','v12-2-tag','ETAPA AUTOMÁTICA · APÓS A ENTRADA'),el('h2','','🎲 Após pedra · mensagem independente'));
  box.append(el('p','v12-2-help','O NEXO lê automaticamente a última pedra que completou o padrão. A mensagem é enviada em outro balão, DEPOIS da entrada e do CADASTRE-SE. Não é necessário preencher o número.'));
  const line=el('label','v12-2-line');const enabled=el('input');enabled.type='checkbox';enabled.id='v12-2-after-enabled';enabled.checked=true;line.append(enabled,el('span','','Enviar “Após pedra” automaticamente após confirmar a entrada'));box.append(line);
  const label=el('label','v12-2-caption','Modelo de mensagem (use {pedra}, {numero}, {cor}, {estrategia}):');label.htmlFor='v12-2-after-text';box.append(label);
  const text=el('textarea');text.id='v12-2-after-text';text.maxLength=400;text.rows=2;text.value='🎲 Após pedra: {pedra}';box.append(text);
  const bar=el('div','v12-2-actions');const save=el('button','v12-2-save','💾 Salvar Após pedra');save.type='button';
  const status=el('span','v12-2-save-status','Aguardando configurações');status.id='v12-2-after-status';bar.append(save,status);box.append(bar);
  for(const item of [enabled,text])item.addEventListener('input',()=>{dirty=true;status.textContent='Alterações não salvas';preview()});
  save.addEventListener('click',async()=>{
   if(busy)return;const body={enabled:enabled.checked,text:text.value.trim()};
   if(body.enabled&&!body.text){status.textContent='Informe a mensagem.';return;}
   busy=true;save.disabled=true;try{
    await api('global-signals',payload('PUT',{mode:'afterPattern',afterPattern:body}));
    dirty=false;status.textContent='✓ Modelo salvo para todas as estratégias';preview();
   }catch(e){status.textContent='Erro ao salvar: '+String(e.message||e).slice(0,120)}finally{busy=false;save.disabled=false}
  });
  const stone=$('v12-stone-settings');(stone||root.firstChild)?.insertAdjacentElement?.('beforebegin',box);
  if(!box.isConnected)root.prepend(box);
  void loadAfterPanel();
 }
 async function loadAfterPanel(){if(dirty||!$('v12-2-after-settings'))return;
  try{
   const data=await api('global-signals'),after=data.config?.afterPattern||{};
   $('v12-2-after-enabled').checked=after.enabled!==false;
   $('v12-2-after-text').value=after.text||'🎲 Após pedra: {pedra}';
   $('v12-2-after-status').textContent='✓ Configuração atual carregada';preview();
  }catch(e){$('v12-2-after-status').textContent='Falha ao carregar configuração: '+String(e.message||e).slice(0,100)}
 }
 function setupStrategyOption(){
  const checks=$('strategy-form')?.querySelector('.checks');if(!checks||$('v12-2-after-strategy'))return;
  const label=el('label','v12-2-line'),box=el('input');box.type='checkbox';box.id='v12-2-after-strategy';box.checked=true;
  label.append(box,el('span','','Permitir mensagem automática “Após pedra” nesta estratégia'));
  checks.append(label);
  const select=()=>{const s=typeof strategy==='function'?strategy():null;box.checked=s?.showAfterPattern!==false};
  select();
  // Mudanças de estratégia chamam renderStrategies no código principal.
 }
 function init(){buildAfterPanel();setupStrategyOption();
  const p=$('page-estrategias');if(p&&!p.querySelector('.v12-2-section-note')){
   const intro=el('p','v12-2-section-note','Padrões em quadradinhos · exclusão rápida por ID · mensagens automáticas separadas · nenhuma edição dispara sinais.');
   p.querySelector('#v12-showcase h2')?.insertAdjacentElement('afterend',intro);
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
