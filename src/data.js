import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, runTransaction, query, where, updateDoc } from 'firebase/firestore';
import { cleanTitle, cleanQuestion, parseSessionDate, cleanResponse } from './domain';
const env = import.meta.env;
export const isDemo = !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_AUTH_DOMAIN || !env.VITE_FIREBASE_APP_ID;
let auth, db;
if (!isDemo) { const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_FIREBASE_APP_ID}); auth = getAuth(app); db = getFirestore(app); }
const KEY = 'odilsap-demo-v1';
const uid = sessionStorage.getItem('odilsap-uid') || crypto.randomUUID(); sessionStorage.setItem('odilsap-uid', uid);
const read = () => ({prompts:{},answers:{},answerVotes:{},comments:{},...JSON.parse(localStorage.getItem(KEY) || '{"classes":{},"questions":{},"votes":{}}')});
const write = state => { localStorage.setItem(KEY, JSON.stringify(state)); window.dispatchEvent(new Event('demo-change')); };
export function watchUser(callback) { if (isDemo) { callback({uid, isAnonymous: true}); return () => {}; } return onAuthStateChanged(auth, callback); }
export async function participantLogin() { if (!isDemo && !auth.currentUser) await signInAnonymously(auth); }
export async function login(email, password, register) { if (isDemo) return {uid: 'demo-admin', email:'demo@classroom.local', isAnonymous:false}; const credential = await (register ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth,email,password); return credential.user; }
export async function logout() { if (!isDemo) await signOut(auth); }
export function watchClasses(ownerId, callback, fail) { if (isDemo) return demoWatch(s => Object.values(s.classes).filter(c=>c.ownerId===ownerId&&!c.deleted),callback,fail); // Rules require an owner-filtered query.
return onSnapshot(query(collection(db,'classes'),where('ownerId','==',ownerId)), snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>!c.deleted)),fail); }
function demoWatch(select, callback, fail) { const update=()=>{try{callback(select(read()));}catch(e){fail?.(e);}}; update(); window.addEventListener('storage',update); window.addEventListener('demo-change',update); return ()=>{window.removeEventListener('storage',update);window.removeEventListener('demo-change',update);}; }
export function watchClass(id, callback, fail) { if(isDemo) return demoWatch(s=>s.classes[id] || null,callback,fail); return onSnapshot(doc(db,'classes',id),s=>callback(s.exists()?{id:s.id,...s.data()}:null),fail); }
export function watchContent(id, session, kind, callback, fail, management=false) {
 if(isDemo) return demoWatch(s=>Object.values(s[kind]).filter(v=>v.classId===id && v.sessionId===session && (!['questions','prompts'].includes(kind)||management||v.published!==false)),callback,fail);
 const ref=collection(db,'classes',id,'sessions',session,kind);
 const source=['questions','prompts'].includes(kind)&&!management?query(ref,where('published','==',true)):ref;
 return onSnapshot(source,s=>{
  const rows=s.docs.map(d=>({id:d.id,...d.data()})); callback(rows);
  // Existing questions predate moderation; the owner upgrades them when opening the class.
  if(['questions','prompts'].includes(kind)&&management){const legacy=s.docs.filter(d=>d.data().published===undefined);legacy.forEach(d=>runTransaction(db,async tx=>{const latest=await tx.get(d.ref);if(latest.exists()&&latest.data().published===undefined)tx.update(d.ref,{published:true});}).catch(fail));}
 },fail);
}

export async function createClass(title,user) { title=cleanTitle(title); const id=crypto.randomUUID(), sessionId=crypto.randomUUID(); const c={id,title,ownerId:user.uid,activeSessionId:sessionId,sessionNumber:1,createdAt:Date.now(),sessionStartedAt:Date.now()}; if(isDemo){const s=read();s.classes[id]=c;write(s);}else await setDoc(doc(db,'classes',id),c); return id; }
export async function newSession(c) { const next={activeSessionId:crypto.randomUUID(),sessionNumber:c.sessionNumber+1,sessionStartedAt:Date.now(),sessionLabel:''}; if(isDemo){const s=read();const current=s.classes[c.id]; if(current.activeSessionId!==c.activeSessionId) throw new Error('開催回が更新されました。もう一度お試しください。');s.sessions ||= {};s.sessions[c.activeSessionId]={id:c.activeSessionId,classId:c.id,number:current.sessionNumber,startedAt:current.sessionStartedAt,label:current.sessionLabel||''};s.sessions[next.activeSessionId]={id:next.activeSessionId,classId:c.id,number:next.sessionNumber,startedAt:next.sessionStartedAt,label:''};s.classes[c.id]={...current,...next};write(s);}else await runTransaction(db,async tx=>{const ref=doc(db,'classes',c.id);const current=(await tx.get(ref)).data();if(current.activeSessionId!==c.activeSessionId)throw new Error('開催回が更新されました。もう一度お試しください。');tx.set(doc(db,'classes',c.id,'sessions',c.activeSessionId),{number:current.sessionNumber,startedAt:current.sessionStartedAt,label:current.sessionLabel||''});tx.set(doc(db,'classes',c.id,'sessions',next.activeSessionId),{number:next.sessionNumber,startedAt:next.sessionStartedAt,label:''});tx.update(ref,next);}); }
export async function postQuestion(c,body,name,user) { body=cleanQuestion(body);name=name.trim();if(name.length>40)throw new Error('名前は40文字以内にしてください。'); const id=crypto.randomUUID(),q={id,body,name,authorId:user.uid,createdAt:Date.now(),published:true}; if(isDemo){const s=read();if(s.classes[c.id].deleted||s.classes[c.id].published===false||s.classes[c.id].activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。新しい画面で投稿してください。');s.questions[id]={...q,classId:c.id,sessionId:c.activeSessionId};write(s);}else await setDoc(doc(db,'classes',c.id,'sessions',c.activeSessionId,'questions',id),q); }
export async function toggleVote(c,q,user,selected) {const id=q.id+'_'+user.uid; if(isDemo){const s=read();if(s.classes[c.id].deleted||s.classes[c.id].published===false||s.classes[c.id].activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');if(selected)delete s.votes[id];else s.votes[id]={id,questionId:q.id,userId:user.uid,classId:c.id,sessionId:c.activeSessionId};write(s);}else {const ref=doc(db,'classes',c.id,'sessions',c.activeSessionId,'votes',id);if(selected)await deleteDoc(ref);else await setDoc(ref,{questionId:q.id,userId:user.uid});} }

export async function changeSessionDate(c,value) {
 const sessionStartedAt=parseSessionDate(value);
 if(isDemo){const s=read();const current=s.classes[c.id];if(current.activeSessionId!==c.activeSessionId)throw new Error('開催回が更新されました。日時を確認してもう一度お試しください。');s.classes[c.id]={...current,sessionStartedAt};write(s);}
 else await runTransaction(db,async tx=>{const ref=doc(db,'classes',c.id);const current=(await tx.get(ref)).data();if(current.activeSessionId!==c.activeSessionId)throw new Error('開催回が更新されました。日時を確認してもう一度お試しください。');tx.update(ref,{sessionStartedAt});});
}

export async function setQuestionVisible(c,q,visible) {
 if(isDemo){const s=read();if(!s.questions[q.id])throw new Error('この質問は削除されました。');s.questions[q.id].published=visible;write(s);}
 else await updateDoc(doc(db,'classes',c.id,'sessions',c.activeSessionId,'questions',q.id),{published:visible});
}
export async function removeQuestion(c,q) {
 if(isDemo){const s=read();delete s.questions[q.id];write(s);}
 else await deleteDoc(doc(db,'classes',c.id,'sessions',c.activeSessionId,'questions',q.id));
}

// Phase 2 is isolated from the existing question/vote collections.
export async function createPrompt(c,body) {
 body=cleanResponse(body,'設問');const id=crypto.randomUUID(),p={id,body,accepting:false,published:true,commentsEnabled:true,createdAt:Date.now()};
 if(isDemo){const s=read();assertActive(s,c);s.prompts[id]={...p,classId:c.id,sessionId:c.activeSessionId};write(s);}
 else await setDoc(doc(db,'classes',c.id,'sessions',c.activeSessionId,'prompts',id),p);
 return id;
}
function assertActive(s,c){if(s.classes[c.id]?.deleted||s.classes[c.id]?.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。新しい画面で操作してください。');}
function promptRef(c,p){return doc(db,'classes',c.id,'sessions',c.activeSessionId,'prompts',p.id);}
export async function updatePromptBody(c,p,value,user){
 const body=cleanResponse(value,'設問');assertManager(c,user);
 if(isDemo){const s=read();assertActive(s,c);assertManager(s.classes[c.id],user);const prompt=s.prompts[p.id];if(!prompt||prompt.classId!==c.id||prompt.sessionId!==c.activeSessionId)throw new Error('設問が見つかりません。');prompt.body=body;write(s);}
 else await runTransaction(db,async tx=>{const classroom=(await tx.get(doc(db,'classes',c.id))).data();assertManager(classroom,user);if(classroom.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');const ref=promptRef(c,p);if(!(await tx.get(ref)).exists())throw new Error('設問が見つかりません。');tx.update(ref,{body});});
}
export async function setPromptAccepting(c,p,accepting){
 if(isDemo){const s=read();assertActive(s,c);if(!s.prompts[p.id])throw new Error('設問が見つかりません。');s.prompts[p.id].accepting=accepting;write(s);}
 else await runTransaction(db,async tx=>{const classroom=await tx.get(doc(db,'classes',c.id));if(classroom.data()?.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');const ref=promptRef(c,p);const snapshot=await tx.get(ref);if(!snapshot.exists())throw new Error('設問が見つかりません。');tx.update(ref,{accepting});});
}
export function watchPromptContent(c,p,kind,callback,fail,management=false){
 if(isDemo)return demoWatch(s=>!s.prompts[p.id]||(!management&&s.prompts[p.id].published===false)?[]:Object.values(s[kind]).filter(v=>v.classId===c.id&&v.sessionId===c.activeSessionId&&v.promptId===p.id&&(management||(kind==='answers'?v.published!==false:s.answers[v.answerId]&&s.answers[v.answerId].published!==false))),callback,fail);
 const ref=collection(promptRef(c,p),kind);
 const onError=e=>{if(!management&&e.code==='permission-denied')callback([]);else fail?.(e);};
 // Fetch comments only for published answers. An answerId query allows the
 // rules to check the parent answer without exposing hidden comment bodies.
 if(kind==='comments'&&!management){
  const subscriptions=new Map(),cache=new Map();let live=true;
  const emit=()=>{if(live)callback([...cache.values()].flat());};
  const stopAnswers=onSnapshot(query(collection(promptRef(c,p),'answers'),where('published','==',true)),snapshot=>{
   const ids=new Set(snapshot.docs.map(d=>d.id));
   for(const [id,stop] of subscriptions)if(!ids.has(id)){stop();subscriptions.delete(id);cache.delete(id);}
   emit();
   for(const id of ids)if(!subscriptions.has(id))subscriptions.set(id,onSnapshot(query(ref,where('answerId','==',id)),rows=>{cache.set(id,rows.docs.map(d=>({id:d.id,...d.data()})));emit();},e=>{cache.delete(id);emit();if(e.code!=='permission-denied')fail?.(e);}));
  },e=>{for(const stop of subscriptions.values())stop();subscriptions.clear();cache.clear();emit();onError(e);});
  return()=>{live=false;stopAnswers();for(const stop of subscriptions.values())stop();};
 }
 const source=kind==='answers'&&!management?query(ref,where('published','==',true)):ref;
 return onSnapshot(source,snapshot=>{
  callback(snapshot.docs.map(d=>({id:d.id,...d.data()})));
  if(kind==='answers'&&management)for(const d of snapshot.docs.filter(d=>d.data().published===undefined))runTransaction(db,async tx=>{const latest=await tx.get(d.ref);if(latest.exists()&&latest.data().published===undefined)tx.update(d.ref,{published:true});}).catch(fail);
 },onError);
}
export async function postAnswer(c,p,body,name,user){
 body=cleanResponse(body);name=name.trim();if(name.length>40)throw new Error('名前は40文字以内にしてください。');const id=crypto.randomUUID(),answer={id,body,name,authorId:user.uid,createdAt:Date.now(),published:true};
 if(isDemo){const s=read();assertActive(s,c);if(s.classes[c.id].published===false&&s.classes[c.id].ownerId!==user.uid)throw new Error('授業は非公開です。');if(!s.prompts[p.id]?.accepting||s.prompts[p.id]?.published===false)throw new Error('この設問の回答受付は終了しています。');s.answers[id]={...answer,classId:c.id,sessionId:c.activeSessionId,promptId:p.id};write(s);}
 else await setDoc(doc(collection(promptRef(c,p),'answers'),id),answer);
}
export async function toggleAnswerVote(c,p,a,user,selected){
 const id=a.id+'_'+user.uid;
 if(isDemo){const s=read();assertActive(s,c);if(s.classes[c.id].published===false&&s.classes[c.id].ownerId!==user.uid)throw new Error('授業は非公開です。');if(!s.prompts[p.id]||s.prompts[p.id].published===false)throw new Error('設問は非表示または削除されています。');if(!s.answers[a.id]||s.answers[a.id].published===false||s.answers[a.id].promptId!==p.id)throw new Error('回答が見つかりません。');if(selected)delete s.answerVotes[id];else s.answerVotes[id]={id,answerId:a.id,userId:user.uid,classId:c.id,sessionId:c.activeSessionId,promptId:p.id};write(s);}
 else {const ref=doc(collection(promptRef(c,p),'answerVotes'),id);if(selected)await deleteDoc(ref);else await setDoc(ref,{answerId:a.id,userId:user.uid});}
}

export async function postAnswerComment(c,p,a,body,name,user){
 body=cleanResponse(body,'コメント');name=name.trim();if(name.length>40)throw new Error('名前は40文字以内にしてください。');
 const id=crypto.randomUUID(),comment={id,answerId:a.id,body,name,authorId:user.uid,createdAt:Date.now()};
 if(isDemo){const s=read();assertActive(s,c);if(s.classes[c.id].published===false&&s.classes[c.id].ownerId!==user.uid)throw new Error('授業は非公開です。');if(!s.prompts[p.id]||s.prompts[p.id].published===false)throw new Error('設問は非表示または削除されています。');if(s.prompts[p.id].commentsEnabled===false)throw new Error('この設問へのコメントは停止されています。');const answer=s.answers[a.id];if(!answer||answer.published===false||answer.classId!==c.id||answer.sessionId!==c.activeSessionId||answer.promptId!==p.id)throw new Error('回答が見つかりません。');s.comments[id]={...comment,classId:c.id,sessionId:c.activeSessionId,promptId:p.id};write(s);}
 else await setDoc(doc(collection(promptRef(c,p),'comments'),id),comment);
}

async function changePrompt(c,p,patch){
 if(isDemo){const s=read();assertActive(s,c);if(s.classes[c.id].published===false&&s.classes[c.id].ownerId!==user.uid)throw new Error('授業は非公開です。');const target=s.prompts[p.id];if(!target||target.classId!==c.id||target.sessionId!==c.activeSessionId)throw new Error('設問が見つかりません。');Object.assign(target,patch);write(s);}
 else await updateDoc(promptRef(c,p),patch);
}
export const setPromptVisible=(c,p,visible)=>changePrompt(c,p,{published:visible});
export const setPromptCommentsEnabled=(c,p,enabled)=>changePrompt(c,p,{commentsEnabled:enabled});
export async function removePrompt(c,p){
 if(isDemo){const s=read();assertActive(s,c);delete s.prompts[p.id];write(s);}
 else await deleteDoc(promptRef(c,p));
}

function answerRef(c,p,a){return doc(collection(promptRef(c,p),'answers'),a.id);}
export async function setAnswerVisible(c,p,a,visible){
 if(isDemo){const s=read();assertActive(s,c);const target=s.answers[a.id];if(!s.prompts[p.id]||!target||target.classId!==c.id||target.sessionId!==c.activeSessionId||target.promptId!==p.id)throw new Error('回答が見つかりません。');target.published=visible;write(s);}
 else await updateDoc(answerRef(c,p,a),{published:visible});
}
export async function removeAnswer(c,p,a){
 if(isDemo){const s=read();assertActive(s,c);const target=s.answers[a.id];if(!target||target.classId!==c.id||target.sessionId!==c.activeSessionId||target.promptId!==p.id)throw new Error('回答が見つかりません。');delete s.answers[a.id];write(s);}
 else await deleteDoc(answerRef(c,p,a));
}

function assertManager(c,user){if(!c||c.deleted||!user||user.isAnonymous||c.ownerId!==user.uid)throw new Error('この授業の管理者だけが変更できます。');}
export async function renameClass(c,value,user){
 const title=cleanTitle(value);assertManager(c,user);
 if(isDemo){const s=read();assertManager(s.classes[c.id]||{},user);s.classes[c.id].title=title;write(s);}
 else await updateDoc(doc(db,'classes',c.id),{title});
}
export async function renameSession(c,session,value,user){
 const label=cleanTitle(value);assertManager(c,user);
 if(!session.id||session.id.includes('/'))throw new Error('有効な開催回を選択してください。');
 if(isDemo){const s=read(),current=s.classes[c.id];assertManager(current||{},user);s.sessions ||= {};
  if(session.id===c.activeSessionId&&current.activeSessionId!==session.id)throw new Error('開催回が更新されました。選び直してください。');
  if(session.id===current.activeSessionId){current.sessionLabel=label;s.sessions[session.id]={id:session.id,classId:c.id,number:current.sessionNumber,startedAt:current.sessionStartedAt,label};}
  else s.sessions[session.id]={...s.sessions[session.id],id:session.id,classId:c.id,label};
  write(s);
 }else await runTransaction(db,async tx=>{
  const ref=doc(db,'classes',c.id),current=(await tx.get(ref)).data();assertManager(current||{},user);
  if(session.id===c.activeSessionId&&current.activeSessionId!==session.id)throw new Error('開催回が更新されました。選び直してください。');
  const meta=doc(db,'classes',c.id,'sessions',session.id);
  if(session.id===current.activeSessionId){tx.update(ref,{sessionLabel:label});tx.set(meta,{number:current.sessionNumber,startedAt:current.sessionStartedAt,label});}
  else tx.set(meta,{label},{merge:true});
 });
}

export async function setClassPublished(c,published,user){
 assertManager(c,user);
 if(isDemo){const s=read(),latest=s.classes[c.id];assertManager(latest,user);if(latest.deleted)throw new Error('削除済みの授業です。');latest.published=published;write(s);}
 else await updateDoc(doc(db,'classes',c.id),{published});
}
// Logical deletion immediately revokes access to all nested data, including legacy sessions.
export async function removeClass(c,user){
 assertManager(c,user);
 if(isDemo){const s=read();assertManager(s.classes[c.id],user);s.classes[c.id].deleted=true;s.classes[c.id].published=false;write(s);}
 else await updateDoc(doc(db,'classes',c.id),{deleted:true,published:false});
}

async function setPostPinned(c,p,post,pinned,user){
 if(typeof pinned!=='boolean')throw new Error('固定の指定が正しくありません。');assertManager(c,user);
 if(isDemo){const s=read();assertActive(s,c);assertManager(s.classes[c.id],user);const row=(p?s.answers:s.questions)[post.id];if(!row||row.classId!==c.id||row.sessionId!==c.activeSessionId||(p&&row.promptId!==p.id))throw new Error('投稿が見つかりません。');row.pinned=pinned;write(s);}
 else await runTransaction(db,async tx=>{const classroom=(await tx.get(doc(db,'classes',c.id))).data();assertManager(classroom,user);if(classroom.activeSessionId!==c.activeSessionId)throw new Error('開催回が変わりました。');const ref=p?doc(promptRef(c,p),'answers',post.id):doc(db,'classes',c.id,'sessions',c.activeSessionId,'questions',post.id);if(!(await tx.get(ref)).exists())throw new Error('投稿が見つかりません。');tx.update(ref,{pinned});});
}
export const setQuestionPinned=(c,q,pinned,user)=>setPostPinned(c,null,q,pinned,user);
export const setAnswerPinned=(c,p,a,pinned,user)=>setPostPinned(c,p,a,pinned,user);
