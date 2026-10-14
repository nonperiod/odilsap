import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOperationGate} from '../src/operation-gate.js';
test('Rapid submissions execute once before any render, including different buttons',async()=>{
 const run=createOperationGate();let finish,calls=0;
 const pending=run(async()=>{calls++;await new Promise(resolve=>{finish=resolve;});});
 const attempts=await Promise.all(Array.from({length:20},()=>run(async()=>{calls++;})));
 assert.equal(calls,1);assert.ok(attempts.every(v=>v===false));
 finish();assert.equal(await pending,true);
 assert.equal(await run(async()=>{calls++;}),true);assert.equal(calls,2);
});
test('Failure releases the gate for correction and retry',async()=>{
 const run=createOperationGate();await assert.rejects(run(async()=>{throw new Error('offline');}),/offline/);
 assert.equal(await run(async()=>{}),true);
});
