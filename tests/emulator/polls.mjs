import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,updateDoc,setDoc,onSnapshot} from 'firebase/firestore';
import {savePollFirebase,setPollStatusFirebase,removePollFirebase,submitPollFirebase,watchManagedResponsesFirebase,syncPollResultsFirebase} from '../../src/polls-store.js';
const env=await initializeTestEnvironment({projectId:'demo-odilsap',firestore:{rules:await readFile('firestore.rules','utf8')}});
const teacher=env.authenticatedContext('integration-teacher',{firebase:{sign_in_provider:'password'}}).firestore();
const student=env.authenticatedContext('integration-student',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const other=env.authenticatedContext('integration-other',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const third=env.authenticatedContext('integration-third',{firebase:{sign_in_provider:'anonymous'}}).firestore();
const unrelated=env.authenticatedContext('integration-unrelated',{firebase:{sign_in_provider:'password'}}).firestore();
let stops=[];after(async()=>{stops.forEach(stop=>stop());await env.cleanup();});
function waitSummary(db,path,count){return new Promise((resolve,reject)=>{let stop;const timer=setTimeout(()=>{stop?.();reject(new Error('Aggregate did not synchronize'));},10000);stop=onSnapshot(doc(db,path),snapshot=>{if(snapshot.data()?.responseCount===count){clearTimeout(timer);stop();resolve(snapshot.data());}},e=>{clearTimeout(timer);stop?.();reject(e);});});}
await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'classes/integration'),{id:'integration',title:'Class',ownerId:'integration-teacher',activeSessionId:'s',sessionNumber:1,createdAt:1,sessionStartedAt:1}));
test('Spark client transactions and rules enforce deduplication; management listeners publish and catch up after being closed',async()=>{
 const c={id:'integration',activeSessionId:'s'},definition={title:'Choose',type:'multiple',options:['A','B']};
 const path='classes/integration/sessions/s/polls/p',summary=path+'/results/summary';
 await assert.rejects(savePollFirebase(unrelated,c,'p',definition));
 await savePollFirebase(teacher,c,'p',definition);
 await savePollFirebase(teacher,c,'p',{...definition,title:'Choose updated'});
 const p=(await getDoc(doc(teacher,path))).data();
 await assert.rejects(submitPollFirebase(student,c,p,{choices:[0]},{uid:'integration-student'}));
 await setPollStatusFirebase(teacher,c,p,'accepting',true);
 await assert.rejects(submitPollFirebase(student,c,p,{choices:[0,0]},{uid:'integration-student'}));
 const results=await Promise.all(Array.from({length:5},()=>submitPollFirebase(student,c,p,{choices:[0,1],name:'Student'},{uid:'integration-student'})));
 assert.equal(results.filter(r=>!r.duplicate).length,1);
 await submitPollFirebase(other,c,p,{choices:[1]},{uid:'integration-other'});
 assert.equal((await getDocs(collection(teacher,path+'/responses'))).size,2);
 assert.deepEqual((await getDoc(doc(teacher,summary))).data(),{responseCount:0,counts:[0,0]});
 await assert.rejects(getDoc(doc(student,summary)));
 await assert.rejects(savePollFirebase(teacher,c,'p',definition));
 const ready=waitSummary(teacher,summary,2);
 const stop=watchManagedResponsesFirebase(teacher,c,p,()=>{},e=>assert.fail(e.message));stops.push(stop);
 assert.deepEqual(await ready,{responseCount:2,counts:[1,2]});
 await setPollStatusFirebase(teacher,c,p,'resultsPublished',true);
 assert.equal((await getDoc(doc(student,summary))).data().responseCount,2);
 stop();stops=stops.filter(s=>s!==stop);
 await submitPollFirebase(third,c,p,{choices:[0]},{uid:'integration-third'});
 assert.equal((await getDoc(doc(teacher,summary))).data().responseCount,2);
 const catchUp=waitSummary(student,summary,3);
 stops.push(watchManagedResponsesFirebase(teacher,c,p,()=>{},e=>assert.fail(e.message)));
 assert.deepEqual(await catchUp,{responseCount:3,counts:[2,2]});
 // A delayed snapshot from another teacher tab cannot overwrite newer counts.
 await syncPollResultsFirebase(teacher,c,p,[{choices:[0]}]);
 assert.equal((await getDoc(doc(teacher,summary))).data().responseCount,3);
 await setPollStatusFirebase(teacher,c,p,'accepting',false);
 await setPollStatusFirebase(teacher,c,p,'resultsPublished',false);
 await assert.rejects(getDoc(doc(student,summary)));
 await updateDoc(doc(teacher,'classes/integration'),{activeSessionId:'next',sessionNumber:2,sessionStartedAt:Date.now()});
 await assert.rejects(submitPollFirebase(student,c,p,{choices:[0]},{uid:'integration-student'}));
 await assert.rejects(setPollStatusFirebase(teacher,c,p,'accepting',true));
 assert.equal((await getDoc(doc(teacher,summary))).data().responseCount,3);
 const next={...c,activeSessionId:'next'};
 await savePollFirebase(teacher,next,'p',definition);
 assert.equal((await getDoc(doc(teacher,'classes/integration/sessions/next/polls/p/results/summary'))).data().responseCount,0);
});
test('Single choice and private text submissions use the same Spark path; edits are rejected against a stale definition',async()=>{
 const c={id:'integration',activeSessionId:'next'};
 for(const type of ['single','text']){
  const path=`classes/integration/sessions/next/polls/${type}`;
  await savePollFirebase(teacher,c,type,{title:type,type,options:['A','B']});
  const p=(await getDoc(doc(teacher,path))).data();
  await savePollFirebase(teacher,c,type,{title:type+' edited',type,options:['A','B']});
  await setPollStatusFirebase(teacher,c,p,'accepting',true);
  await assert.rejects(submitPollFirebase(student,c,p,{choices:[0],text:'Private answer'},{uid:'integration-student'}));
  const latest=(await getDoc(doc(teacher,path))).data();
  await submitPollFirebase(student,c,latest,{choices:[0],text:'Private answer',name:'Named student'},{uid:'integration-student'});
  const own=(await getDoc(doc(student,path+'/responses/integration-student'))).data();
  assert.equal(own.name,'Named student');
  await assert.rejects(getDoc(doc(other,path+'/responses/integration-student')));
  const ready=waitSummary(teacher,path+'/results/summary',1);
  stops.push(watchManagedResponsesFirebase(teacher,c,latest,()=>{},e=>assert.fail(e.message)));
  assert.deepEqual(await ready,{responseCount:1,counts:type==='text'?[]:[1,0]});
  assert.equal(JSON.stringify((await getDoc(doc(teacher,path+'/results/summary'))).data()).includes('Private answer'),false);
 }
});
test('Eight different participants can submit simultaneously to an eight-option poll without losing answers',async()=>{
 const c={id:'integration',activeSessionId:'next'},path='classes/integration/sessions/next/polls/concurrent';
 await savePollFirebase(teacher,c,'concurrent',{title:'Eight options',type:'multiple',options:Array.from({length:8},(_,i)=>`Option ${i}`)});
 const p=(await getDoc(doc(teacher,path))).data();await setPollStatusFirebase(teacher,c,p,'accepting',true);
 const clients=Array.from({length:8},(_,i)=>({uid:`parallel-${i}`,db:env.authenticatedContext(`parallel-${i}`,{firebase:{sign_in_provider:'anonymous'}}).firestore()}));
 await Promise.all(clients.map((client,i)=>submitPollFirebase(client.db,c,p,{choices:[i]},{uid:client.uid})));
 assert.equal((await getDocs(collection(teacher,path+'/responses'))).size,8);
 const ready=waitSummary(teacher,path+'/results/summary',8);
 stops.push(watchManagedResponsesFirebase(teacher,c,p,()=>{},e=>assert.fail(e.message)));
 assert.deepEqual(await ready,{responseCount:8,counts:Array(8).fill(1)});
});

test('Legacy poll migration preserves answers; chart changes, hiding and deletion use the Spark client path',async()=>{
 const c={id:'integration',activeSessionId:'next'},path='classes/integration/sessions/next/polls/legacy';
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),{id:'legacy',kind:'poll',title:'Legacy',type:'single',options:['A','B'],accepting:true,resultsPublished:true,hasResponses:false,createdAt:1,updatedAt:1});
  await setDoc(doc(ctx.firestore(),path+'/results/summary'),{responseCount:0,counts:[0,0]});
 });
 const p=(await getDoc(doc(teacher,path))).data();
 await setPollStatusFirebase(teacher,c,p,'published',true);
 await submitPollFirebase(student,c,p,{choices:[0]},{uid:'integration-student'});
 await setPollStatusFirebase(teacher,c,p,'chartType','pie');
 assert.equal((await getDoc(doc(student,path))).data().chartType,'pie');
 await assert.rejects(setPollStatusFirebase(other,c,p,'chartType','bar'));
 await setPollStatusFirebase(teacher,c,p,'published',false);
 await assert.rejects(submitPollFirebase(other,c,p,{choices:[1]},{uid:'integration-other'}));
 await setPollStatusFirebase(teacher,c,p,'published',true);
 assert.equal((await getDoc(doc(student,path+'/responses/integration-student'))).data().choices[0],0);
 await removePollFirebase(teacher,c,p);
 assert.equal((await getDoc(doc(teacher,path))).exists(),false);
 await assert.rejects(getDoc(doc(student,path+'/results/summary')));
});
