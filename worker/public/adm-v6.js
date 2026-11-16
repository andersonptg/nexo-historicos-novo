/* NEXO V6 | editor de estrategia visual. Nao registra sinais ou acessa segredos. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag,cls,text) => {const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
  let start=false, duplicateOpposite=false;
  const MAX_PATTERN_STONES=256;
  const COLORS={white:'Branco',red:'Vermelho',black:'Preto','*':'Coringa azul'};
  const opposite=v=>v==='red'?'black':v==='black'?'red':v;
  const codeColor=code => code==='*'?'joker':code==='white'?'white':code==='black'?'black':code==='red'?'red':/^n:(\d{1,2})$/.test(code)?(Number(code.slice(2))===0?'white':Number(code.slice(2))<=7?'red':'black'):'joker';
  const stoneNode=(token,{button=false,numbered=true,mini=false}={})=>{
    const type=codeColor(token),numeric=/^n:(\d{1,2})$/.test(token)?token.slice(2):'';
    const node=el(button?'button':'span','v6-stone '+type+(mini?' v6-mini':''));
    if(button)node.type='button';
    node.setAttribute('aria-label',numeric!==''?`Pedra ${numeric}`:COLORS[token]||'Coringa');
    const face=el('span','v6-stone-face',numbered&&numeric!==''?numeric:(type==='joker'?'★':''));
    node.append(face);
    return node;
  };
  function tokens(){return $('st-pattern').value.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
  function setTokens(t){$('st-pattern').value=t.join(', ');renderPattern()}
  function append(token){let t=tokens();if(t.length>=MAX_PATTERN_STONES){pop('Limite técnico de '+MAX_PATTERN_STONES+' pedras para proteger o processamento.',true);return}t.push(token);setTokens(t)}
  function visibleNumbers(){return $('v6-numbers')?.checked!==false}
  function showBuilder(){
    const root=$('v6-builder');if(!root)return;
    const exact=$('v6-exact'),seq=$('v6-sequence');
    root.classList.toggle('v6-hide-exact',!visibleNumbers());
    exact.replaceChildren();
    for(let n=0;n<=14;n++){
      const x=stoneNode('n:'+n,{button:true,numbered:true});
      x.title=`Adicionar numero exato ${n}`;
      x.onclick=()=>append('n:'+n);exact.append(x);
    }
    seq.replaceChildren();
    const parts=tokens();
    if(!parts.length)seq.append(el('span','v6-hint','Toque nas pedras abaixo para montar o padrão.'));
    for(let i=0;i<parts.length;i++){
      const code=parts[i],n=stoneNode(code,{button:true,numbered:visibleNumbers()});
      n.title='Remover pedra '+(i+1);
      n.onclick=()=>{const next=tokens();next.splice(i,1);setTokens(next)};
      seq.append(n);
    }
    $('v6-length').textContent=parts.length+' / '+MAX_PATTERN_STONES+' pedras';
    const target=$('st-target').value;
    // Branco é um alvo exclusivo: NÃO exibir preto nem uma segunda pedra.
    $('v6-target').replaceChildren(...(target==='white'?['white']:[target,'white']).map(v=>stoneNode(v,{mini:true})));
    $('v6-target-text').textContent=target==='white'?'ENTRAR SOMENTE NO BRANCO':target==='red'?'ENTRADA VERMELHO + BRANCO':'ENTRADA PRETO + BRANCO';
    const oppositeBox=$('v6-opposite');
    if(oppositeBox){
      oppositeBox.disabled=target==='white';
      oppositeBox.closest('label').hidden=target==='white';
      if(target==='white'){oppositeBox.checked=false;duplicateOpposite=false;}
    }
    $('v6-gale-name').textContent=({'0':'SEM GALE','1':'ATE GALE 1','2':'ATE GALE 2'})[$('st-gale').value]||'SEM GALE';
  }
  function createBuilder(){
    const form=$('strategy-form');if(!form || $('v6-builder'))return;
    const older=$('pattern-palette')?.closest('.builder');if(!older)return;
    older.hidden=true;
    const raw=$('st-pattern');
    const rawRow=raw.closest('.formgrid');if(rawRow)rawRow.hidden=true;
    const oldLabel=older.previousElementSibling;if(oldLabel?.tagName==='LABEL')oldLabel.hidden=true;
    const note=rawRow?.nextElementSibling;if(note?.tagName==='SMALL')note.hidden=true;
    const chk=$('st-joker')?.closest('label');if(chk){chk.hidden=true;} // coringa azul nao precisa habilitar branco global
    const numbering=$('st-numbers')?.closest('label');if(numbering)numbering.hidden=true;
    $('st-name').required=false;
    $('st-name').placeholder='Automatico: Estrategia 1, Estrategia 2...';
    const nameLabel=$('st-name').previousElementSibling;
    if(nameLabel?.tagName==='LABEL')nameLabel.textContent='Nome (opcional)';
    $('st-target').querySelector('[value="black"]').textContent='PRETO + BRANCO';
    $('st-target').querySelector('[value="red"]').textContent='VERMELHO + BRANCO';
    for(const [v,l] of [['0','SEM GALE'],['1','ATÉ GALE 1'],['2','ATÉ GALE 2']]){
      const op=$('st-gale').querySelector(`[value="${v}"]`);if(op)op.textContent=l;
    }
    const builder=el('div','v6-builder');builder.id='v6-builder';
    const heading=el('div','v6-builder-head');heading.append(el('div','', 'MONTE SUA SEQUÊNCIA'),el('span','v6-count','0 / '+MAX_PATTERN_STONES+' pedras'));heading.lastChild.id='v6-length';
    const seq=el('div','v6-sequence');seq.id='v6-sequence';
    const goal=el('div','v6-goal');goal.append(el('span','v6-equal','='));
    const faces=el('span','v6-goal-stones');faces.id='v6-target';
    const label=el('span','v6-goal-label');label.id='v6-target-text';goal.append(faces,label);
    const lead=el('div','v6-subtitle','PEDRAS EXATAS • TOQUE PARA ADICIONAR');
    const nums=el('div','v6-number-row');nums.id='v6-exact';
    const bar=el('div','v6-builder-tools');
    const check=el('label','v6-toggle');
    const inp=el('input');inp.type='checkbox';inp.checked=true;inp.id='v6-numbers';
    check.append(inp,el('span','','Ativar números nas pedras'));
    inp.onchange=()=>{$('st-numbers').checked=inp.checked;showBuilder()};
    const undo=el('button','v6-small-button','↶ Desfazer');undo.type='button';undo.onclick=()=>setTokens(tokens().slice(0,-1));
    const clear=el('button','v6-small-button','Limpar');clear.type='button';clear.onclick=()=>setTokens([]);
    bar.append(check,undo,clear);
    const selectTitle=el('div','v6-subtitle','CORES LIVRES E CORINGA');
    const colors=el('div','v6-color-row');
    for(const [code,label] of [['white','BRANCO'],['red','VERMELHO'],['black','PRETO'],['*','CORINGA']]){
      const b=el('button','v6-color-button');b.type='button';b.append(stoneNode(code),el('span','',label));b.title='Adicionar '+label;
      b.onclick=()=>append(code);colors.append(b);
    }
    const explanation=el('p','v6-explain','Azul = qualquer pedra. Ex.: 0 + 4 coringas = entrada após a quarta rodada seguinte ao zero; não é previsão garantida.');
    const gale=el('div','v6-meta');gale.append(el('span','','GALE'),el('strong','','SEM GALE'));gale.lastChild.id='v6-gale-name';
    const duplicate=el('label','v6-opposite');const toggle=el('input');toggle.type='checkbox';toggle.id='v6-opposite';toggle.onchange=()=>duplicateOpposite=toggle.checked;
    duplicate.append(toggle,el('span','','Criar também uma estratégia oposta ao salvar (inverte vermelho/preto, sem ativar).'));
    builder.append(heading,seq,goal,bar,lead,nums,selectTitle,colors,explanation,gale,duplicate);
    older.before(builder);
    $('st-target').addEventListener('change',showBuilder);
    $('st-gale').addEventListener('change',showBuilder);
    showBuilder();
  }
  const galaText = v => v===0?'SEM GALE':v===1?'ATE GALE 1':'ATE GALE 2';
  function savedCard(s){
    const card=el('article','v6-saved-card'+(s.id===selected?' v6-selected':''));
    const top=el('div','v6-saved-head');top.append(el('strong','v6-saved-name',s.name),el('span','v6-state'+(s.enabled?' on':''),s.enabled?'ATIVA':'PAUSADA'));
    const pattern=el('div','v6-saved-pattern');for(const v of (s.pattern||[]))pattern.append(stoneNode(v,{mini:true,numbered:s.showNumbers!==false}));
    const arrow=el('span','v6-arrow','→');
    pattern.append(arrow,...(s.target==='white'?['white']:[s.target||'black','white']).map(v=>stoneNode(v,{mini:true})));
    const meta=el('div','v6-saved-meta');meta.append(el('span','',galaText(s.maxGale||0)),el('span','',s.target==='white'?'SOMENTE BRANCO':'BRANCO INCLUSO'),el('span','',`PADRAO ${(s.pattern||[]).length} PEDRAS`));
    const sc=model?.scores?.find(x=>x.id===s.id);
    const score=el('div','v6-score-mini',sc?`PLACAR  GREEN ${sc.green||0}  ·  BRANCO ${sc.white||0}  ·  RED ${sc.red||0}`:'PLACAR AINDA SEM RESULTADOS');
    const controls=el('div','v6-card-actions');
    const edit=el('button','outline','Editar');edit.type='button';edit.onclick=()=>{selected=s.id;renderStrategies();renderMessage();$('page-estrategias').scrollIntoView({behavior:'smooth',block:'start'})};
    const enable=el('button',s.enabled?'danger':'primary',s.enabled?'Pausar':'Ativar');enable.type='button';
    enable.onclick=()=>call(async()=>{
      if(!s.enabled&&!confirm('Ativar esta estrategia para analisar novas rodadas? Historicos antigos nao devem disparar sinais.'))return;
      await api('strategies/'+s.id,payload('PUT',{...s,enabled:!s.enabled}));
      await reload();pop(s.enabled?'Estrategia pausada.':'Estrategia ativada para novas rodadas.');
    });
    const scores=el('button','outline','Ver placar');scores.type='button';scores.onclick=()=>page('placares');
    const erase=el('button','v10-purge','Apagar definitivamente');erase.type='button';
    erase.title='Exclui somente esta estratégia; não altera histórico, robô ou grupos.';
    erase.onclick=()=>call(async()=>{
      if(!confirm('Excluir definitivamente a estratégia "'+s.name+'"? Apenas esta regra e seu placar serão apagados.'))return;
      erase.disabled=true;
      try{
        await api('strategies/'+s.id+'/purge',payload('POST',{confirm:true,id:s.id}));
        if(selected===s.id)selected='';
        await reload();pop('Estratégia apagada: '+s.name+'. Outras estratégias preservadas.');
      }finally{erase.disabled=false}
    });
    controls.append(edit,enable,scores,erase);
    card.append(top,pattern,meta,score,controls);return card;
  }
  function renderSavedList(){
    const box=$('strategy-list');if(!box||!model)return;
    box.replaceChildren();
    if(!model.strategies.length){box.append(el('p','v6-hint','Nenhuma estratégia salva ainda. Monte o padrão acima e pressione Salvar estratégia.'));return}
    for(const s of model.strategies)box.append(savedCard(s));
  }
  function initV6(){
    if(start||!$('strategy-form')||typeof renderStrategies!=='function')return;
    start=true;document.title='NEXO Control • V6';
    document.querySelectorAll('.brand small').forEach(e=>e.textContent='CONTROL CENTER V6');
    const title=$('page-estrategias').querySelector('h1');if(title)title.textContent='Montador de estratégias';
    const description=$('page-estrategias').querySelector('.pagehead p:not(.eyebrow)');
    if(description)description.textContent='Monte pelas pedras, defina o alvo e o Gale. Salve e acompanhe a estratégia completa no cartão abaixo.';
    const listPanel=$('strategy-list').closest('.panel');if(listPanel)listPanel.querySelector('h2').textContent='ESTRATÉGIAS SALVAS • VISÃO COMPLETA';
    createBuilder();
    const oldRenderPattern=renderPattern;
    renderPattern=function(){oldRenderPattern();showBuilder()};
    const oldRenderStrategies=renderStrategies;
    renderStrategies=function(){oldRenderStrategies();$('v6-numbers').checked=$('st-numbers').checked;showBuilder();renderSavedList()};
    const oldSave=saveStrategy;
    saveStrategy=async function(options={}){
      const original=strategy(),copy=readStrategy(),shouldDup=duplicateOpposite&&copy.target!=='white'&&!original&&!options.toggle;
      await oldSave(options);
      if(shouldDup){
        const name=copy.name.trim()?copy.name.trim()+' • Oposta':'';
        const oppositePattern=copy.pattern.map(opposite);
        const alt={...copy,name,pattern:oppositePattern,target:opposite(copy.target),enabled:false};
        try{
          await api('strategies',payload('POST',alt));
          await reload();pop('Estrategias original e oposta salvas e pausadas.');
        }catch(e){pop('Original salvo. A oposta nao foi criada: '+e.message,true)}
      }
      if($('v6-opposite'))$('v6-opposite').checked=false;duplicateOpposite=false;
    };
    if(model)renderStrategies();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initV6,{once:true});
  else initV6();
})();
