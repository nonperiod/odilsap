import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,runTransaction} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-odilsap',firestore:{rules:await readFile('firestore.rules','utf8')}});
after(()=>env.cleanup());
await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();await setDoc(doc(db,'classes/history'),{ownerId:'owner',activeSessionId:'new'});
 await setDoc(doc(db,'classes/history/sessions/old'),{number:1,startedAt:1});
 for(const [path,value] of [
 ['questions/q',{body:'過去',published:true}],['votes/q_student',{questionId:'q',userId:'student'}],['prompts/p',{body:'設問',published:true}],['prompts/p/answers/a',{body:'個別',published:true}],['prompts/p/answerVotes/a_student',{answerId:'a',userId:'student'}],['polls/p',{published:true}],['polls/p/responses/student',{name:'',choices:[0]}]
 ])await setDoc(doc(db,'classes/history/sessions/old/'+path),value);
});
const owner=env.authenticatedContext('owner',{firebase:{sign_in_provider:'password'}}).firestore();
const other=env.authenticatedContext('other',{firebase:{sign_in_provider:'password'}}).firestore();
const student=env.authenticatedContext('student',{firebase:{sign_in_provider:'anonymous'}}).firestore();
test('Only class owner may discover history or read historical result collections',async()=>{
 for(const path of ['sessions','sessions/old/questions','sessions/old/votes','sessions/old/prompts','sessions/old/prompts/p/answers','sessions/old/prompts/p/answerVotes','sessions/old/polls','sessions/old/polls/p/responses']){
  await assertSucceeds(getDocs(collection(owner,'classes/history/'+path)));
  await assertFails(getDocs(collection(student,'classes/history/'+path)));
  await assertFails(getDocs(collection(other,'classes/history/'+path)));
 }
 await assertFails(getDoc(doc(student,'classes/history/sessions/old/polls/p/responses/student')));
});
test('Only owner may record session metadata and exports have no public storage collection',async()=>{
 const ref=db=>doc(db,'classes/history/sessions/new');
 await assertSucceeds(setDoc(ref(owner),{number:2,startedAt:100}));
 await assertFails(setDoc(ref(student),{number:2,startedAt:100}));
 await assertFails(setDoc(ref(other),{number:2,startedAt:100}));
 await assertFails(setDoc(ref(owner),{number:2,startedAt:100,score:10}));
 await assertFails(getDoc(doc(student,'classes/history/exports/file')));
 await assertFails(getDoc(doc(student,'classes/history/sessions/new/scores/student')));
 await assertFails(getDoc(doc(student,'classes/history/sessions/new/attendance/student')));
});

test('Owner can rename and archive sessions atomically; others cannot change names or routing',async()=>{
 const cid='history-edit',ref=db=>doc(db,'classes',cid);
 await assertSucceeds(setDoc(ref(owner),{id:cid,title:'旧名',ownerId:'owner',activeSessionId:'one',sessionNumber:1,createdAt:1,sessionStartedAt:10}));
 await assertSucceeds(setDoc(doc(owner,`classes/${cid}/sessions/one/questions/q`),{id:'q',body:'過去の投稿',name:'',authorId:'owner',createdAt:1,published:true}));
 await assertSucceeds(updateDoc(ref(owner),{title:'新しい授業名'}));
 await assertFails(updateDoc(ref(student),{title:'不正'}));await assertFails(updateDoc(ref(other),{title:'不正'}));await assertFails(updateDoc(ref(owner),{title:''}));
 await assertSucceeds(updateDoc(ref(owner),{sessionLabel:'第 1 回（演習）'}));
 await assertFails(updateDoc(ref(student),{sessionLabel:'不正'}));await assertFails(updateDoc(ref(owner),{sessionLabel:'x'.repeat(101)}));
 await assertSucceeds(runTransaction(owner,async tx=>{
  const current=(await tx.get(ref(owner))).data();
  tx.set(doc(owner,`classes/${cid}/sessions/one`),{number:current.sessionNumber,startedAt:current.sessionStartedAt,label:current.sessionLabel});
  tx.set(doc(owner,`classes/${cid}/sessions/two`),{number:2,startedAt:20,label:''});
  tx.update(ref(owner),{activeSessionId:'two',sessionNumber:2,sessionStartedAt:20,sessionLabel:''});
 }));
 await assertSucceeds(getDoc(doc(owner,`classes/${cid}/sessions/one/questions/q`)));await assertFails(getDoc(doc(student,`classes/${cid}/sessions/one/questions/q`)));
 await assertSucceeds(updateDoc(doc(owner,`classes/${cid}/sessions/one`),{label:'事前学習'}));await assertFails(updateDoc(doc(other,`classes/${cid}/sessions/one`),{label:'不正'}));
 await assertSucceeds(setDoc(doc(owner,`classes/${cid}/sessions/legacy`),{label:'旧開催回の名前'}));
 await assertFails(updateDoc(ref(owner),{sessionNumber:1}));await assertFails(updateDoc(ref(owner),{ownerId:'other'}));
});

test('Class publication and deletion revoke student access across all sessions; only owner can operate',async()=>{
 const cid='class-status',ref=db=>doc(db,'classes',cid),q=db=>doc(db,`classes/${cid}/sessions/s/questions/q`);
 await assertSucceeds(setDoc(ref(owner),{id:cid,title:'公開テスト',ownerId:'owner',activeSessionId:'s',sessionNumber:1,createdAt:1,sessionStartedAt:1}));
 await assertSucceeds(setDoc(q(owner),{id:'q',body:'公開本文',name:'',authorId:'owner',createdAt:1,published:true}));
 await assertSucceeds(getDoc(ref(student)));await assertSucceeds(getDoc(q(student)));
 await assertFails(updateDoc(ref(other),{published:false}));await assertFails(updateDoc(ref(student),{deleted:true,published:false}));
 await assertSucceeds(updateDoc(ref(owner),{published:false}));
 await assertFails(getDoc(ref(student)));await assertFails(getDoc(q(student)));await assertSucceeds(getDoc(q(owner)));
 await assertFails(setDoc(doc(student,`classes/${cid}/sessions/s/questions/new`),{id:'new',body:'拒否',name:'',authorId:'student',createdAt:1,published:true}));
 await assertSucceeds(updateDoc(ref(owner),{published:true}));await assertSucceeds(getDoc(q(student)));
 await assertSucceeds(updateDoc(ref(owner),{deleted:true,published:false}));
 await assertFails(getDoc(ref(student)));await assertFails(getDoc(q(owner)));await assertFails(updateDoc(ref(owner),{published:true}));
});
