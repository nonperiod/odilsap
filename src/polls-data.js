import {getApp} from 'firebase/app';
import {getFirestore,collection,doc,onSnapshot,query,where,updateDoc} from 'firebase/firestore';
import {savePollFirebase,setPollStatusFirebase,removePollFirebase,submitPollFirebase,watchManagedResponsesFirebase,aggregateResponses} from './polls-store.js';
import {isDemo} from './data';
import {normalizePoll,normalizeSubmission} from './poll-domain.js';
const KEY='odilsap-demo-v1';
const read=()=>({polls:{},pollResponses:{},pollResults:{},...JSON.parse(localStorage.getItem(KEY)||'{"classes":{},"questions":{},"votes":{}}')});
const write=s=>{localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new Event('demo-change'));};
const key=(c,id)=>`${c.id}_${c.activeSessionId}_${id}`;
function watch(select,callback,fail){const update=()=>{try{callback(select(read()));}catch(e){fail?.(e);}};update();window.addEventListener('storage',update);window.addEventListener('demo-change',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('demo-change',update);};}
const ref=(c,id)=>doc(getFirestore(getApp()),'classes',c.id,'sessions',c.activeSessionId,'polls',id);
export function watchPolls(c,callback,fail,management=false){
 if(isDemo)return watch(s=>Object.values(s.polls).filter(p=>p.classId===c.id&&p.sessionId===c.activeSessionId&&(management||p.published!==false)),callback,fail);
 const polls=collection(getFirestore(getApp()),'classes',c.id,'sessions',c.activeSessionId,'polls');
 return onSnapshot(management?polls:query(polls,where('published','==',true)),snap=>{
  const rows=snap.docs.map(d=>({id:d.id,...d.data()}));callback(rows);
  // Existing polls become queryable by students when the owner opens management.
  if(management)snap.docs.filter(d=>d.data().published===undefined).forEach(d=>updateDoc(d.ref,{published:true}).catch(fail));
 },fail);
}
export function watchOwnResponse(c,p,user,callback,fail){if(isDemo)return watch(s=>s.pollResponses[key(c,p.id)+'_'+user.uid]||null,callback,fail);return onSnapshot(doc(ref(c,p.id),'responses',user.uid),snap=>callback(snap.exists()?snap.data():null),e=>{callback(null);if(e.code!=='permission-denied')fail?.(e);});}
export function watchResults(c,p,callback,fail){if(isDemo)return watch(s=>s.pollResults[key(c,p.id)]||null,callback,fail);return onSnapshot(doc(ref(c,p.id),'results','summary'),snap=>callback(snap.exists()?snap.data():null),e=>{callback(null);if(e.code!=='permission-denied')fail?.(e);});}
async function call(c,id,action,input,user){
 if(!isDemo){const db=getFirestore(getApp());if(action==='remove')return removePollFirebase(db,c,{id});if(action==='save')return savePollFirebase(db,c,id,input);if(action==='status')return setPollStatusFirebase(db,c,{id},input.field,input.value);return submitPollFirebase(db,c,input.poll,input,user);}
 const s=read(),k=key(c,id),poll=s.polls[k],aggregate=s.pollResults[k];
 if(s.classes[c.id]?.deleted||s.classes[c.id]?.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');
 if(action==='submit'){
  if(s.classes[c.id].published===false&&s.classes[c.id].ownerId!==user.uid)throw new Error('授業は非公開です。');
  if(!poll)throw new Error('投票が見つかりません。');
  const responseKey=k+'_'+user.uid;if(s.pollResponses[responseKey])return {submitted:true,duplicate:true};
  if(poll.published===false)throw new Error('この投票は非表示です。');
  if(!poll.accepting)throw new Error('投票の受付は終了しています。');
  const answer=normalizeSubmission(poll,input);s.pollResponses[responseKey]={...answer,userId:user.uid,createdAt:Date.now()};poll.hasResponses=true;
 }else{
  if(s.classes[c.id].ownerId!==user.uid)throw new Error('授業の管理者だけが操作できます。');
  if(action==='remove'){delete s.polls[k];}else if(action==='save'){
   if(poll&&(poll.accepting||poll.hasResponses||aggregate?.responseCount>0))throw new Error('受付中、または回答がある投票は編集できません。');
   s.polls[k]={...normalizePoll(input),id,classId:c.id,sessionId:c.activeSessionId,kind:'poll',accepting:false,resultsPublished:false,hasResponses:false,published:poll?.published!==false,chartType:poll?.chartType||'bar',createdAt:poll?.createdAt||Date.now()};s.pollResults[k]={responseCount:0,counts:s.polls[k].options.map(()=>0)};
  }else{if(!poll)throw new Error('投票が見つかりません。');poll[input.field]=input.value;}
 }
 write(s);return {submitted:true};
}
export const savePoll=(c,id,input,user)=>call(c,id,'save',input,user);
export const setPollStatus=(c,p,field,value,user)=>call(c,p.id,'status',{field,value},user);
export const submitPoll=(c,p,input,user)=>call(c,p.id,'submit',{...input,poll:p},user);

export function watchResponses(c,p,callback,fail){
 if(!isDemo)return watchManagedResponsesFirebase(getFirestore(getApp()),c,p,callback,fail);
 return watch(s=>Object.entries(s.pollResponses).filter(([k])=>k.startsWith(key(c,p.id)+'_')).map(([,v])=>v),rows=>{
  callback(rows);const s=read(),k=key(c,p.id);if(s.classes[c.id]?.activeSessionId!==c.activeSessionId||s.polls[k]?.type!==p.type||JSON.stringify(s.polls[k]?.options)!==JSON.stringify(p.options))return;
  const result=aggregateResponses(p,rows);
  if(JSON.stringify(s.pollResults[k])!==JSON.stringify(result)){s.pollResults[k]=result;write(s);}
 },fail);
}

export const removePoll=(c,p,user)=>call(c,p.id,'remove',{},user);
