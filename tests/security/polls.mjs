import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,query,where} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-odilsap',firestore:{rules:await readFile('firestore.rules','utf8')}});
after(()=>env.cleanup());
const definition={id:'p',kind:'poll',title:'?',type:'single',options:['A','B'],accepting:true,resultsPublished:false,hasResponses:true,createdAt:1,updatedAt:1};
await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();await setDoc(doc(db,'classes/security'),{ownerId:'teacher',activeSessionId:'s'});
 for(const sid of ['s','old']){
  const base=`classes/security/sessions/${sid}/polls/p`;
  await setDoc(doc(db,base),definition);
  await setDoc(doc(db,base+'/results/summary'),{responseCount:1,counts:[1,0]});
  await setDoc(doc(db,base+'/responses/student'),{choices:[0],name:'Private name',text:'',createdAt:1,userId:'student'});
 }
});
const student=env.authenticatedContext('student',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const stranger=env.authenticatedContext('other',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const teacher=env.authenticatedContext('teacher',{firebase:{sign_in_provider:'password'}}).firestore();
const unrelated=env.authenticatedContext('unrelated',{firebase:{sign_in_provider:'password'}}).firestore();
const base='classes/security/sessions/s/polls/p';
test('Only owner can list responses; students can only get their own response',async()=>{
 await assertSucceeds(getDoc(doc(student,base)));
 await assertSucceeds(getDoc(doc(student,base+'/responses/student')));
 await assertFails(getDoc(doc(stranger,base+'/responses/student')));
 await assertFails(getDocs(collection(student,base+'/responses')));
 await assertFails(getDocs(collection(unrelated,base+'/responses')));
 await assertSucceeds(getDocs(collection(teacher,base+'/responses')));
});
test('Unpublished aggregates remain secret and students cannot forge counts or change immutable responses',async()=>{
 await assertFails(getDoc(doc(student,base+'/results/summary')));
 await assertSucceeds(getDoc(doc(teacher,base+'/results/summary')));
 await assertFails(setDoc(doc(student,base+'/responses/student'),{choices:[1],name:'',text:'',createdAt:1,userId:'student'}));
 await assertFails(deleteDoc(doc(student,base+'/responses/student')));
 await assertFails(updateDoc(doc(student,base+'/results/summary'),{responseCount:999}));
 await assertFails(setDoc(doc(stranger,base+'/results/forged'),{responseCount:1,counts:[1,0]}));
 await assertFails(updateDoc(doc(unrelated,base),{accepting:false}));
 await assertFails(updateDoc(doc(stranger,base),{resultsPublished:true}));
});
test('Rules validate direct submissions even if client validation is bypassed',async()=>{
 const response={userId:'other',name:'',text:'',choices:[0],createdAt:1};
 for(const choices of [[],[0,0],[0,1],[-1],[2],['0'],[0.5]])await assertFails(setDoc(doc(stranger,base+'/responses/other'),{...response,choices}));
 await assertFails(setDoc(doc(stranger,base+'/responses/student'),response));
 await assertFails(setDoc(doc(stranger,base+'/responses/other'),{...response,name:'x'.repeat(41)}));
 await assertFails(setDoc(doc(stranger,base+'/responses/other'),{...response,text:'unexpected'}));
 await assertFails(setDoc(doc(stranger,base+'/responses/other'),{...response,score:999}));
 await assertSucceeds(setDoc(doc(stranger,base+'/responses/other'),response));
 await assertFails(deleteDoc(doc(teacher,base+'/responses/other')));
});
test('Answered poll structure stays locked while owner may correct display text even with a stale zero summary',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),base+'/results/summary'),{responseCount:0,counts:[0,0]});});
 await assertFails(updateDoc(doc(teacher,base),{hasResponses:false}));
 await assertSucceeds(updateDoc(doc(teacher,base),{title:'Corrected question'}));
 await assertFails(updateDoc(doc(teacher,base),{options:['C','D']}));
 await assertFails(updateDoc(doc(student,base),{title:'tampered'}));
 await assertFails(deleteDoc(doc(unrelated,base)));
 await assertSucceeds(updateDoc(doc(teacher,base),{accepting:false}));
 const late=env.authenticatedContext('late',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 await assertFails(setDoc(doc(late,base+'/responses/late'),{userId:'late',name:'',text:'',choices:[0],createdAt:1}));
});
test('First answer must atomically lock its definition; lock-only requests are denied',async()=>{
 const fresh='classes/security/sessions/s/polls/fresh';
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),fresh),{...definition,id:'fresh',hasResponses:false}));
 const response={userId:'student',name:'',text:'',choices:[0],createdAt:1};
 await assertFails(updateDoc(doc(student,fresh),{hasResponses:true}));
 await assertFails(setDoc(doc(student,fresh+'/responses/student'),response));
 const batch=writeBatch(student);batch.update(doc(student,fresh),{hasResponses:true});batch.set(doc(student,fresh+'/responses/student'),response);await assertSucceeds(batch.commit());
});
test('Owner-only publication, revocation and old-session isolation preserve privacy',async()=>{
 await assertSucceeds(updateDoc(doc(teacher,base),{resultsPublished:true}));
 await assertSucceeds(getDoc(doc(student,base+'/results/summary')));
 await assertFails(getDoc(doc(student,base+'/responses/other')));
 await assertSucceeds(updateDoc(doc(teacher,base),{resultsPublished:false}));
 await assertFails(getDoc(doc(student,base+'/results/summary')));
 await assertFails(getDoc(doc(student,'classes/security/sessions/old/polls/p')));
 await assertFails(getDoc(doc(student,'classes/security/sessions/old/polls/p/responses/student')));
 await assertSucceeds(getDoc(doc(teacher,'classes/security/sessions/old/polls/p/results/summary')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),base)));
});
test('Poll and aggregate schemas reject extra secrets, malformed choices and malformed counts',async()=>{
 const path='classes/security/sessions/s/polls/new';
 const fresh={...definition,id:'new',accepting:false,hasResponses:false};
 for(const change of [{options:['A','A']},{options:['']},{options:Array(9).fill('A')},{options:['A','x'.repeat(101)]},{correctAnswer:0}])await assertFails(setDoc(doc(teacher,path),{...fresh,...change}));
 await assertSucceeds(setDoc(doc(teacher,path),fresh));
 for(const data of [{responseCount:0,counts:[0]},{responseCount:0,counts:[1,0]},{responseCount:0,counts:[0,0],answers:['private'] }])await assertFails(setDoc(doc(teacher,path+'/results/summary'),data));
 await assertSucceeds(setDoc(doc(teacher,path+'/results/summary'),{responseCount:0,counts:[0,0]}));
});

test('Chart controls and visibility belong to owner; hidden/deleted polls block students and filtered lists remain readable',async()=>{
 const path='classes/security/sessions/s/polls/moderated';
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),{...definition,id:'moderated',published:true,chartType:'bar',resultsPublished:true});
  await setDoc(doc(ctx.firestore(),path+'/results/summary'),{responseCount:1,counts:[1,0]});
  await setDoc(doc(ctx.firestore(),path+'/responses/student'),{choices:[0],name:'',text:'',createdAt:1,userId:'student'});
 });
 await assertFails(updateDoc(doc(student,path),{chartType:'pie'}));
 await assertFails(updateDoc(doc(unrelated,path),{published:false}));
 await assertFails(updateDoc(doc(teacher,path),{chartType:'invalid'}));
 await assertSucceeds(updateDoc(doc(teacher,path),{chartType:'pie'}));
 await assertSucceeds(getDoc(doc(student,path+'/results/summary')));
 await assertSucceeds(updateDoc(doc(teacher,path),{published:false}));
 await assertFails(getDoc(doc(student,path)));
 await assertFails(getDoc(doc(student,path+'/responses/student')));
 await assertFails(getDoc(doc(student,path+'/results/summary')));
 await assertFails(setDoc(doc(stranger,path+'/responses/other'),{userId:'other',choices:[0],name:'',text:'',createdAt:1}));
 await assertSucceeds(getDocs(query(collection(student,'classes/security/sessions/s/polls'),where('published','==',true))));
 await assertFails(getDocs(collection(student,'classes/security/sessions/s/polls')));
 await assertSucceeds(updateDoc(doc(teacher,path),{published:true}));
 await assertSucceeds(getDoc(doc(student,path)));
 await assertFails(deleteDoc(doc(student,path)));
 await assertSucceeds(deleteDoc(doc(teacher,path)));
 await assertFails(getDoc(doc(student,path+'/responses/student')));
 await assertFails(getDoc(doc(student,path+'/results/summary')));
 await assertSucceeds(getDoc(doc(teacher,path+'/responses/student')));
});
