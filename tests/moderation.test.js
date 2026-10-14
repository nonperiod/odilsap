import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {readFile,writeFile,unlink} from 'node:fs/promises';
test('Demo moderation preserves votes when hidden, removes deleted questions, and updates subscribers',async()=>{
 const file=new URL('../src/.moderation-test.mjs',import.meta.url);
 const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const saved={localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,window:globalThis.window};
 Object.assign(globalThis,{localStorage:storage,sessionStorage:storage,window:new EventTarget()});
 let stops=[];
 try{
  const source=(await readFile(new URL('../src/data.js',import.meta.url),'utf8')).replace("from './domain'","from './domain.js'");
  const result=await transform(source,{format:'esm',define:{'import.meta.env':'{}'}});await writeFile(file,result.code);
  const data=await import(file.href);const user={uid:'admin'};const id=await data.createClass('Test',user);let current;
  stops.push(data.watchClass(id,c=>current=c));
  let student=[],admin=[],votes=[];
  stops.push(data.watchContent(id,current.activeSessionId,'questions',rows=>student=rows,undefined,false));
  stops.push(data.watchContent(id,current.activeSessionId,'questions',rows=>admin=rows,undefined,true));
  stops.push(data.watchContent(id,current.activeSessionId,'votes',rows=>votes=rows));
  await data.postQuestion(current,'Question','',user);const question=student[0];await data.toggleVote(current,question,user,false);
  await data.setQuestionVisible(current,question,false);assert.equal(student.length,0);assert.equal(admin.length,1);assert.equal(votes.length,1);
  await data.setQuestionVisible(current,question,true);assert.equal(student.length,1);assert.equal(votes.length,1);
  await data.removeQuestion(current,question);assert.equal(student.length,0);assert.equal(admin.length,0);
 }finally{stops.forEach(stop=>stop());await unlink(file).catch(()=>{});Object.assign(globalThis,saved);}
});
