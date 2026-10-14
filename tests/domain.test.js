import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanTitle,cleanQuestion,rankQuestions} from '../src/domain.js';
test('Reject empty and oversized submissions',()=>{assert.throws(()=>cleanTitle('  '));assert.throws(()=>cleanTitle('a'.repeat(101)));assert.throws(()=>cleanQuestion(' '));assert.throws(()=>cleanQuestion('a'.repeat(1001)));assert.equal(cleanQuestion('  question  '),'question');});
test('Rank by independent vote records, then recency; do not mutate source',()=>{const q=[{id:'a',createdAt:1},{id:'b',createdAt:2},{id:'c',createdAt:3}];const votes=[{questionId:'a'},{questionId:'a'},{questionId:'b'}];assert.deepEqual(rankQuestions(q,votes,'popular').map(v=>[v.id,v.count]),[['a',2],['b',1],['c',0]]);assert.deepEqual(rankQuestions(q,votes,'recent').map(v=>v.id),['c','b','a']);assert.equal(q[0].count,undefined);});
import {sessionDateInput,parseSessionDate} from '../src/domain.js';
test('Session dates use Japan time and reject invalid calendar dates',()=>{const value='2026-10-05T09:30';assert.equal(new Date(parseSessionDate(value)).toISOString(),'2026-10-05T00:30:00.000Z');assert.equal(sessionDateInput(parseSessionDate(value)),value);assert.throws(()=>parseSessionDate('2026-02-30T09:30'));assert.throws(()=>parseSessionDate(''));});
import {paginateQuestions} from '../src/domain.js';
test('Pagination caps a page at ten and clamps after removals',()=>{const rows=Array.from({length:21},(_,id)=>({id}));assert.equal(paginateQuestions(rows,1).items.length,10);assert.equal(paginateQuestions(rows,3).items[0].id,20);assert.equal(paginateQuestions(rows.slice(0,10),3).currentPage,1);assert.equal(paginateQuestions([],9).currentPage,1);assert.equal(paginateQuestions(rows.slice(0,10),1).totalPages,1);assert.equal(paginateQuestions(rows.slice(0,11),1).totalPages,2);});
test('Browser datetime-local seconds are accepted without weakening calendar validation',()=>{
 assert.equal(new Date(parseSessionDate('2026-10-06T10:15:00')).toISOString(),'2026-10-06T01:15:00.000Z');
 assert.equal(new Date(parseSessionDate('2026-10-06T10:15:42.12')).toISOString(),'2026-10-06T01:15:42.120Z');
 for(const value of ['2026-02-30T10:15:00','2026-10-06T10:15:60','2026-10-06T24:00:00','2026-10-06T10:15Z'])assert.throws(()=>parseSessionDate(value));
});

test('Pinned posts precede votes in newest posting order and all fit on page one',()=>{
 const rows=Array.from({length:25},(_,i)=>({id:String(i),createdAt:i,pinned:i<12}));
 const votes=Array.from({length:20},()=>({questionId:'24'}));
 for(const order of ['popular','recent']){
 const ranked=rankQuestions(rows,votes,order);
 assert.deepEqual(ranked.slice(0,12).map(q=>q.id),Array.from({length:12},(_,i)=>String(11-i)));
 const pages=[1,2,3].map(page=>paginateQuestions(ranked,page));
 assert.equal(pages[0].items.length,12);assert.ok(pages[0].items.every(q=>q.pinned));
 assert.equal(pages[1].items.length,10);assert.equal(pages[2].items.length,3);
 assert.deepEqual(pages.flatMap(p=>p.items),ranked);
 }
 const unpinned=rows.map(q=>({...q,pinned:false}));assert.equal(rankQuestions(unpinned,votes,'popular')[0].id,'24');
 assert.ok(rows[0].pinned);assert.equal(rows[0].count,undefined);
});
