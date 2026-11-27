// Política de aposentadoria do controlador legado. Nenhum heartbeat artificial.
export const localRetired=env=>env?.NEXO_CORES_LOCAL_RETIRED==='1';
export function effectiveLocalControl(env,desired){
 if(!localRetired(env))return desired;
 const revision=Number(desired?.revision)||0;
 return {...(desired||{}),enabled:false,revision:revision+(desired?.enabled===false?0:1),retired:true};
}
export function localControlSafety(env,desired,heartbeat,at){
 const age=heartbeat?.at?at-Number(heartbeat.at):null;
 const recent=age!==null&&Number.isFinite(age)&&age>=0&&age<60;
 const stopped=desired?.enabled===false&&heartbeat?.motor===false&&recent;
 const conflict=heartbeat?.motor===true&&age!==null&&Number.isFinite(age)&&age<60;
 const retired=localRetired(env);
 // Flag explícita do administrador após verificar o encerramento físico do serviço.
 return {retired,stopped,conflict,safe:retired?!conflict:stopped};
}
