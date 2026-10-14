import ExcelJS from 'exceljs';
import {safeCell} from './results-domain.js';
export async function toExcel(tables){
 const workbook=new ExcelJS.Workbook();workbook.creator='odilsap';
 for(const t of tables){
  if(t.rows.length>1048575)throw new Error('Excelの行数上限を超えています。CSVをご利用ください。');
  const sheet=workbook.addWorksheet(t.name,{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=t.headers.map(h=>({width:/本文|設問$|自由記述$|内容|状態$/.test(h)?80:/日時/.test(h)?30:/ID/.test(h)?38:24}));
  sheet.addRow(t.headers);
  for(const row of t.rows)sheet.addRow(row.map(v=>v===''?null:typeof v==='number'?v:safeCell(v)));
  sheet.getRow(1).height=42;
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'},name:'Yu Gothic',size:11};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF28594D'}};});
  sheet.eachRow((row,index)=>{
   row.alignment={wrapText:true,vertical:'top'};
   if(index>1){row.font={name:'Yu Gothic',size:11};row.height=Math.min(409,Math.max(32,...row.values.filter(v=>typeof v==='string').map(v=>v.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/36)),0)*17+12)));}
   row.eachCell((cell,column)=>{
    const header=t.headers[column-1];
    if(index>1&&header.includes('日時')&&typeof cell.value==='string'&&cell.value.endsWith(' JST')){
     cell.value=(Date.parse(cell.value.replace(' JST','').replace(' ','T')+'Z')/86400000)+25569;
     cell.numFmt='yyyy-mm-dd hh:mm:ss "JST"';
    }
    if(index>1&&header.includes('割合')&&typeof cell.value==='number')cell.numFmt='0.0%';
   });
  });
  sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:t.headers.length}};
 }
 return workbook.xlsx.writeBuffer();
}
