import {getApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore,collection,doc,getDocFromServer,getDocsFromServer} from 'firebase/firestore';
import {isDemo} from './data';
const key='odilsap-demo-v1';
const read=()=>JSON.parse(localStorage.getItem(key)||'{}');
const rows=async(db,path)=>(await getDocsFromServer(collection(db,...path))).docs.map(d=>({...d.data(),id:d.id}));
function assertOwner(c,user){if(!user||user.isAnonymous||c.ownerId!==user.uid||c.deleted)throw new Error('この授業の管理者だけが結果を取得できます。');}
export async function authorizeResults(c,user){
 assertOwner(c,user);
 if(isDemo){assertOwner(read().classes?.[c.id]||{},user);return;}
 const authUser=getAuth(getApp()).currentUser;
 if(authUser?.uid!==user.uid)throw new Error('管理者として再ログインしてください。');
 assertOwner((await getDocFromServer(doc(getFirestore(getApp()),'classes',c.id))).data()||{},authUser);
}
export async function listSessions(c,user){
 await authorizeResults(c,user);
 const current={id:c.activeSessionId,number:c.sessionNumber,startedAt:c.sessionStartedAt,label:c.sessionLabel||''};
 let history;
 if(isDemo){const s=read();history=Object.values(s.sessions||{}).filter(x=>x.classId===c.id);const ids=new Set(['questions','prompts','polls'].flatMap(k=>Object.values(s[k]||{}).filter(x=>x.classId===c.id).map(x=>x.sessionId)));for(const id of ids)if(!history.some(x=>x.id===id))history.push({id,number:null,startedAt:null});}
 else history=await rows(getFirestore(getApp()),['classes',c.id,'sessions']);
 return [...history.filter(x=>x.id!==current.id),current].sort((a,b)=>(b.number||0)-(a.number||0));
}
// Freeze each acquired collection; summaries are always derived from these
// exact response rows, never from the asynchronously published summaries.
export async function loadResults(c,session,user){
 assertOwner(c,user);
 if(!session.id||session.id.includes('/'))throw new Error('有効な開催回IDを指定してください。');
 let questions,votes,prompts,polls;
 if(isDemo){
  const s=read();assertOwner(s.classes?.[c.id]||{},user);
  const select=k=>Object.values(s[k]||{}).filter(x=>x.classId===c.id&&x.sessionId===session.id);
  questions=select('questions');votes=select('votes');
  prompts=select('prompts').map(p=>({...p,answers:select('answers').filter(a=>a.promptId===p.id),votes:select('answerVotes').filter(a=>a.promptId===p.id),comments:select('comments').filter(a=>a.promptId===p.id)}));
  polls=select('polls').map(p=>({...p,responses:Object.entries(s.pollResponses||{}).filter(([k])=>k.startsWith(`${c.id}_${session.id}_${p.id}_`)).map(([,v])=>v)}));
 }else{
  const db=getFirestore(getApp());assertOwner((await getDocFromServer(doc(db,'classes',c.id))).data()||{},getAuth(getApp()).currentUser);
  const path=['classes',c.id,'sessions',session.id];
  [questions,votes,prompts,polls]=await Promise.all(['questions','votes','prompts','polls'].map(k=>rows(db,[...path,k])));
  prompts=await Promise.all(prompts.map(async p=>({...p,answers:await rows(db,[...path,'prompts',p.id,'answers']),votes:await rows(db,[...path,'prompts',p.id,'answerVotes']),comments:await rows(db,[...path,'prompts',p.id,'comments'])})));
  polls=await Promise.all(polls.map(async p=>({...p,responses:await rows(db,[...path,'polls',p.id,'responses'])})));
 }
 return structuredClone({classId:c.id,title:c.title,session,acquiredAt:Date.now(),questions,votes,prompts,polls});
}
