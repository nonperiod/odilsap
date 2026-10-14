import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {toExcel} from '../src/results-excel.js';
import {resultTables} from '../src/results-domain.js';
import {fixture} from './results-fixture.js';
import {mkdir,writeFile} from 'node:fs/promises';
test('Real xlsx reload preserves types, Japanese, newlines, headers and frozen panes',async()=>{
 const tables=resultTables(fixture,true,0);const bytes=await toExcel(tables);
 assert.equal(bytes[0],80);assert.equal(bytes[1],75);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
 assert.equal(wb.worksheets.length,8);
 const q=wb.getWorksheet('質問');assert.equal(q.getCell('J2').value,'匿名');assert.ok(q.getCell('I2').value.startsWith("'=HYPERLINK"));assert.ok(q.getCell('I2').value.includes('\n日本語,回答'));assert.equal(q.getCell('L2').value,1);
 assert.ok(q.getCell('E2').value instanceof Date);assert.equal(q.getCell('E2').numFmt,'yyyy-mm-dd hh:mm:ss "JST"');assert.equal(q.views[0].ySplit,1);
 for(const sheet of wb.worksheets)sheet.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula)));
 const summary=wb.getWorksheet('投票集計');assert.equal(summary.getCell('L2').value,1);assert.equal(summary.getCell('M2').value,2);assert.equal(summary.getCell('N2').value,.5);
 await mkdir('outputs/phase5',{recursive:true});await writeFile('outputs/phase5/results-verification.xlsx',bytes);
 const emptyBytes=await toExcel(resultTables({...fixture,questions:[],prompts:[],polls:[]},false,0));const empty=new ExcelJS.Workbook();await empty.xlsx.load(emptyBytes);assert.equal(empty.getWorksheet('質問').rowCount,1);assert.equal(empty.getWorksheet('投票個別回答').getCell('H1').value,'投票ID');
});
