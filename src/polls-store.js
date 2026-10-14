import {collection,doc,deleteDoc,getDoc,onSnapshot,runTransaction} from 'firebase/firestore';
import {normalizePoll,normalizeSubmission,addToAggregate} from './poll-domain.js';
export const pollRef=(db,c,id)=>doc(db,'classes',c.id,'sessions',c.activeSessionId,'polls',id);
const classRef=(db,c)=>doc(db,'classes',c.id);
function assertActive(snapshot,c){if(snapshot.data()?.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');}
export async function savePollFirebase(db,c,id,input){
 const definition=normalizePoll(input),ref=pollRef(db,c,id),summary=doc(ref,'results','summary');
 return runTransaction(db,async tx=>{
  const classroom=await tx.get(classRef(db,c)),existing=await tx.get(ref),result=await tx.get(summary);
  assertActive(classroom,c);const poll=existing.data();
  if(poll&&(poll.accepting||poll.hasResponses||result.data()?.responseCount>0))throw new Error('受付中、または回答がある投票は編集できません。');
  tx.set(ref,{...definition,id,kind:'poll',accepting:false,resultsPublished:false,hasResponses:false,published:poll?.published!==false,chartType:poll?.chartType||'bar',createdAt:poll?.createdAt||Date.now(),updatedAt:Date.now()});
  tx.set(summary,{responseCount:0,counts:definition.options.map(()=>0)});
  return {saved:true};
 });
}
export async function setPollStatusFirebase(db,c,p,field,value){
 if(!(['accepting','resultsPublished','published'].includes(field)&&typeof value==='boolean')&&!(field==='chartType'&&['bar','pie'].includes(value)))throw new Error('設定の指定が正しくありません。');
 return runTransaction(db,async tx=>{
  const classroom=await tx.get(classRef(db,c)),snapshot=await tx.get(pollRef(db,c,p.id));assertActive(classroom,c);
  if(!snapshot.exists())throw new Error('投票が見つかりません。');
  tx.update(snapshot.ref,{[field]:value,updatedAt:Date.now()});
 });
}
export async function submitPollFirebase(db,c,p,input,user){
 const ref=pollRef(db,c,p.id),response=doc(ref,'responses',user.uid);
 assertActive(await getDoc(classRef(db,c)),c);
 try{return await runTransaction(db,async tx=>{
  const snapshot=await tx.get(ref),own=await tx.get(response);
  if(!snapshot.exists())throw new Error('投票が見つかりません。');
  if(own.exists())return {submitted:true,duplicate:true};
  const poll=snapshot.data();if(poll.published===false)throw new Error('この投票は非表示です。');if(!poll.accepting)throw new Error('投票の受付は終了しています。');
  if(poll.type!==p.type||JSON.stringify(poll.options)!==JSON.stringify(p.options)||poll.title!==p.title)throw new Error('設問が変更されました。最新の設問で回答してください。');
  const answer=normalizeSubmission(poll,input);
  tx.set(response,{...answer,userId:user.uid,createdAt:Date.now()});
  // A permanent lock prevents definition edits even while the owner is offline.
  if(!poll.hasResponses)tx.update(ref,{hasResponses:true});
  return {submitted:true};
 });}catch(e){
  // Two transactions may observe the same missing UID record. A denied
  // overwrite can mean another tab already committed the immutable response.
  if(e.code==='permission-denied'){
   const own=await getDoc(response);
   if(own.exists()){assertActive(await getDoc(classRef(db,c)),c);return {submitted:true,duplicate:true};}
  }
  throw e;
 }
}
export function aggregateResponses(poll,rows){return rows.reduce((aggregate,answer)=>addToAggregate(poll,aggregate,answer),{responseCount:0,counts:poll.options.map(()=>0)});}
export async function syncPollResultsFirebase(db,c,p,rows){
 const result=aggregateResponses(p,rows),ref=pollRef(db,c,p.id),summary=doc(ref,'results','summary');
 return runTransaction(db,async tx=>{
  const classroom=await tx.get(classRef(db,c)),snapshot=await tx.get(ref),old=await tx.get(summary);
  if(classroom.data()?.activeSessionId!==c.activeSessionId||!snapshot.exists())return;
  const poll=snapshot.data();
  if(poll.type!==p.type||JSON.stringify(poll.options)!==JSON.stringify(p.options))return;
  // Immutable responses only increase in number. Ignore older snapshots from
  // another teacher tab, and avoid writes when the aggregate is unchanged.
  if((old.data()?.responseCount||0)>result.responseCount||(old.data()?.responseCount===result.responseCount&&JSON.stringify(old.data()?.counts)===JSON.stringify(result.counts)))return;
  tx.set(summary,result);
 });
}
export function watchManagedResponsesFirebase(db,c,p,callback,fail){
 let live=true;
 const stop=onSnapshot(collection(pollRef(db,c,p.id),'responses'),{includeMetadataChanges:true},snapshot=>{
  const rows=snapshot.docs.map(d=>({id:d.id,...d.data()}));callback(rows);
  // Never publish a partial local cache as if it were the complete collection.
  if(!snapshot.metadata.fromCache)syncPollResultsFirebase(db,c,p,rows).catch(e=>{if(live)fail?.(e);});
 },fail);
 return()=>{live=false;stop();};
}

export async function removePollFirebase(db,c,p){await deleteDoc(pollRef(db,c,p.id));}
