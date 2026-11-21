/* NEXO V6.9 — alocação justa das consultas do coletor Cloud.
 * Intervalos pretendidos, não garantias sobre quando a fonte publica resultados.
 * Um único Durable Object, concorrência limitada e redução automática após falhas.
 */
export function collectionInterval(game,status={}){
 const failures=Number(status?.consecutive_failures)||0;
 if(status?.status==='bloqueado'||status?.status==='erro')
  return Math.min(600000,60000*(2**Math.min(3,Math.max(0,failures-1))));
 if(game.id==='blitz-crash')return 8000;
 if(game.id==='blitz-crash-2')return 12000;
 if(game.id==='blitz-double'||game.id==='blitz-fortune-double')return 15000;
 if(game.platform==='Brabet')return 15000;
 if(game.platform==='Blitz')return 18000;
 return 60000;
}
export function selectDueGames(games,states={},now=Date.now(),batch=5){
 const candidates=games.filter(g=>g.eligible&&g.source_url).map(g=>{
  const status=states[g.id]||{},interval=collectionInterval(g,status);
  const next=(Number(status.last_attempt)||0)+interval;
  return {g,next,interval,overdue:now-next};
 }).filter(x=>x.overdue>=0);
 // Lateness relative to the expected interval prevents starving other platforms.
 candidates.sort((a,b)=>b.overdue/b.interval-a.overdue/a.interval||a.next-b.next||a.g.id.localeCompare(b.g.id));
 return candidates.slice(0,Math.max(1,Math.min(6,Math.trunc(Number(batch)||5))));
}
