import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resultTables,toCsv,jst,safeCell} from '../src/results-domain.js';
import {fixture} from './results-fixture.js';

test('Frozen details and aggregates agree, anonymity and hidden filtering',()=>{
 const tables=resultTables(fixture,false,0),get=n=>tables.find(t=>t.name===n);
 assert.equal(get('質問').rows.length,1);assert.equal(get('質問').rows[0][9],'匿名');assert.equal(get('質問').rows[0][11],1);
 assert.equal(get('自由記述回答').rows.length,1);
 const summary=get('投票集計').rows;assert.equal(summary[0][11],1);assert.equal(summary[1][11],2);assert.equal(summary[0][12],2);assert.equal(summary[0][13],.5);
 assert.equal(summary[2][11],0);assert.equal(get('投票個別回答').rows.length,3);
 assert.equal(resultTables(fixture,true,0)[0].rows.length,2);
 const captured=structuredClone(fixture);const before=resultTables(captured,false,0);fixture.polls[0].responses.push({choices:[0],name:'new'});assert.deepEqual(resultTables(captured,false,0),before);fixture.polls[0].responses.pop();
});
test('CSV preserves BOM, Japanese, multiline quoting and blocks formulas',()=>{
 const csv=toCsv(resultTables(fixture,false,0)[0]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('日本語'));assert.ok(csv.includes("'"+'=HYPERLINK(""危険"")\n日本語,回答'));assert.ok(csv.endsWith('\r\n'));
 for(const value of ['=1','+1','-1','@SUM(A1)',' \t=1','\n=1'])assert.ok(safeCell(value).startsWith("'"));assert.equal(safeCell('通常'), '通常');assert.equal(jst(0),'1970-01-01 09:00:00 JST');assert.equal(jst(null),'不明');
});
test('Empty exports retain headers and missing features are explicit',()=>{
 const s={...fixture,questions:[],prompts:[],polls:[]};const tables=resultTables(s);for(const t of tables.slice(0,5)){assert.equal(t.rows.length,0);assert.ok(toCsv(t).includes('授業名'));assert.ok(toCsv(t).includes('日本語授業'));}assert.ok(tables.at(-1).rows.some(r=>r.includes('未採点・出席')));
});

test('Hidden poll and prompt exclusion applies to aggregates and all child details',()=>{
 const source=structuredClone(fixture);source.polls[0].published=false;source.prompts[0].published=false;
 const tables=resultTables(source,false,0);assert.equal(tables[2].rows.length,0);assert.ok(tables.find(t=>t.name==='投票集計').rows.every(r=>r[7]!=='p'));assert.ok(tables.find(t=>t.name==='投票個別回答').rows.every(r=>r[7]!=='p'));assert.equal(resultTables(source,true,0).find(t=>t.name==='投票個別回答').rows.length,3);
});
