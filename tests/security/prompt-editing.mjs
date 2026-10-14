import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-odilsap',firestore:{rules:await readFile('firestore.rules','utf8')}});
after(()=>env.cleanup());
test('Owner can revise prompt and answered poll text while response structure and locks stay protected',async()=>{
 const root='classes/text-edit/sessions/s',prompt=`${root}/prompts/p`,poll=`${root}/polls/p`;
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'classes/text-edit'),{ownerId:'editor',activeSessionId:'s'});await setDoc(doc(db,prompt),{id:'p',body:'元の設問',accepting:true,published:true,commentsEnabled:true,createdAt:1});await setDoc(doc(db,poll),{id:'p',kind:'poll',title:'元の投票',type:'single',options:['A','B'],accepting:true,resultsPublished:true,hasResponses:true,published:true,createdAt:1,updatedAt:1});await setDoc(doc(db,poll+'/results/summary'),{responseCount:1,counts:[1,0]});});
 const teacher=env.authenticatedContext('editor',{firebase:{sign_in_provider:'password'}}).firestore(),student=env.authenticatedContext('student',{firebase:{sign_in_provider:'anonymous'}}).firestore(),other=env.authenticatedContext('other',{firebase:{sign_in_provider:'password'}}).firestore();
 for(const [path,field] of [[prompt,'body'],[poll,'title']]){
 await assertSucceeds(updateDoc(doc(teacher,path),{[field]:'修正した設問'}));
 assert.equal((await getDoc(doc(teacher,path))).data()[field],'修正した設問');
 for(const db of [student,other])await assertFails(updateDoc(doc(db,path),{[field]:'拒否'}));
 for(const text of ['', 'x'.repeat(1001)])await assertFails(updateDoc(doc(teacher,path),{[field]:text}));
 }
 await assertFails(updateDoc(doc(teacher,poll),{title:'変更',options:['C','D']}));
 await assertFails(updateDoc(doc(teacher,poll),{hasResponses:false}));
 assert.deepEqual((await getDoc(doc(teacher,poll+'/results/summary'))).data(),{responseCount:1,counts:[1,0]});
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'classes/text-edit'),{activeSessionId:'next'}));
 await assertFails(updateDoc(doc(teacher,prompt),{body:'旧開催回'}));await assertFails(updateDoc(doc(teacher,poll),{title:'旧開催回'}));
});

test('Only owner may pin existing questions and answers; students cannot self-pin or change post contents',async()=>{
 const root='classes/pinning/sessions/s',question=`${root}/questions/q`,answer=`${root}/prompts/p/answers/a`;
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'classes/pinning'),{ownerId:'pin-teacher',activeSessionId:'s'});await setDoc(doc(db,`${root}/prompts/p`),{id:'p',body:'?',published:true,accepting:true,commentsEnabled:true,createdAt:1});for(const [path,id] of [[question,'q'],[answer,'a']])await setDoc(doc(db,path),{id,body:'投稿',name:'',authorId:'pin-student',createdAt:1,published:true});});
 const teacher=env.authenticatedContext('pin-teacher',{firebase:{sign_in_provider:'password'}}).firestore(),student=env.authenticatedContext('pin-student',{firebase:{sign_in_provider:'anonymous'}}).firestore(),other=env.authenticatedContext('pin-other',{firebase:{sign_in_provider:'password'}}).firestore();
 for(const path of [question,answer]){
 await assertSucceeds(updateDoc(doc(teacher,path),{pinned:true}));assert.equal((await getDoc(doc(student,path))).data().pinned,true);
 for(const db of [student,other])await assertFails(updateDoc(doc(db,path),{pinned:false}));
 await assertFails(updateDoc(doc(teacher,path),{pinned:'yes'}));await assertFails(updateDoc(doc(teacher,path),{pinned:false,body:'書換'}));
 await assertSucceeds(updateDoc(doc(teacher,path),{pinned:false}));
 const id=path===question?'new-q':'new-a';await assertFails(setDoc(doc(student,path.replace(/[^/]+$/,id)),{id,body:'固定を偽装',name:'',authorId:'pin-student',createdAt:1,published:true,pinned:true}));
 }
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'classes/pinning'),{activeSessionId:'next'}));for(const path of [question,answer])await assertFails(updateDoc(doc(teacher,path),{pinned:true}));
});
