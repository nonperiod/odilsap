import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import {resultTables} from '../src/results-domain.js';
import {sessionName} from '../src/domain.js';
test('Session switch retains complete historical results; renames preserve IDs, data and labels',async()=>{
 const file=new URL('../src/.history-test.mjs',import.meta.url),values=new Map();
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const saved={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,window:globalThis.window};Object.assign(globalThis,{localStorage:storage,sessionStorage:storage,window:new EventTarget()});
 try{
 await build({stdin:{contents:"export * from './src/data.js';export * from './src/results-data.js';export * from './src/polls-data.js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',external:['firebase/*'],define:{'import.meta.env':'{}'},outfile:file.pathname});
 const d=await import(file.href);const teacher={uid:'demo-admin',isAnonymous:false},student={uid:'student',isAnonymous:true};const id=await d.createClass('誤った授業名',teacher);let c;const stop=d.watchClass(id,v=>c=v);
 await d.postQuestion(c,'旧開催回の日本語\n質問','',student);const prompt={id:await d.createPrompt(c,'自由記述')};await d.setPromptAccepting(c,prompt,true);await d.postAnswer(c,prompt,'回答\n改行','',student);
 await d.savePoll(c,'p',{title:'投票',type:'multiple',options:['甲','乙']},teacher);await d.setPollStatus(c,{id:'p'},'accepting',true,teacher);await d.submitPoll(c,{id:'p'},{choices:[0,1]},student);
 const answer=Object.values(JSON.parse(storage.getItem('odilsap-demo-v1')).answers)[0];await d.postAnswerComment(c,prompt,answer,'追加の意見\n日本語','',student);
 const oldId=c.activeSessionId;const original=await d.loadResults(c,(await d.listSessions(c,teacher))[0],teacher);
 await d.renameSession(c,{id:oldId},'第 1 回（演習）',teacher);assert.equal(c.activeSessionId,oldId);assert.equal(sessionName(c),'第 1 回（演習）');const old={...c};await d.newSession(c);assert.notEqual(c.activeSessionId,oldId);assert.equal(c.sessionLabel,'');
 let sessions=await d.listSessions(c,teacher);assert.equal(sessions.length,2);assert.equal(sessions.find(s=>s.id===oldId).label,'第 1 回（演習）');
 let historical=await d.loadResults(c,sessions.find(s=>s.id===oldId),teacher);assert.deepEqual(historical.questions,original.questions);assert.deepEqual(historical.prompts,original.prompts);assert.deepEqual(historical.polls,original.polls);assert.equal(historical.prompts[0].comments.length,1);assert.equal(resultTables(historical).find(t=>t.name==='追加の意見・コメント').rows[0][12],'追加の意見\n日本語');
 const empty=await d.loadResults(c,sessions.find(s=>s.id===c.activeSessionId),teacher);assert.equal(empty.questions.length,0);assert.equal(empty.polls.length,0);
 await d.renameClass(c,'正しい授業名',teacher);await d.renameSession(c,{id:oldId},'第 0 回（事前学習）',teacher);sessions=await d.listSessions(c,teacher);historical=await d.loadResults(c,sessions.find(s=>s.id===oldId),teacher);assert.equal(historical.title,'正しい授業名');assert.equal(historical.session.label,'第 0 回（事前学習）');assert.equal(resultTables(historical)[0].rows[0][2],'第 0 回（事前学習）');assert.deepEqual(historical.polls,original.polls);
 await d.renameSession(c,{id:c.activeSessionId},'補講',teacher);assert.equal(c.sessionNumber,2);assert.equal(sessionName(c),'補講');
 await assert.rejects(d.renameClass(c,'拒否',student));await assert.rejects(d.renameSession(c,{id:oldId},'拒否',student));await assert.rejects(d.renameClass(c,'',teacher));await assert.rejects(d.renameSession(c,{id:oldId},'x'.repeat(101),teacher));await assert.rejects(d.renameSession(old,{id:oldId},'古い画面',teacher));
 await d.setClassPublished(c,false,teacher);await assert.rejects(d.postQuestion(c,'非公開への投稿','',student));await assert.rejects(d.setClassPublished(c,true,student));await d.setClassPublished(c,true,teacher);await d.removeClass(c,teacher);await assert.rejects(d.loadResults(c,{id:oldId},teacher));await assert.rejects(d.listSessions(c,teacher));let classes;const off=d.watchClasses(teacher.uid,v=>classes=v);assert.equal(classes.length,0);off();
 stop();
 }finally{await unlink(file).catch(()=>{});Object.assign(globalThis,saved);}
});
