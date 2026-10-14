export function jst(value){return typeof value==='number'&&Number.isFinite(value)?new Date(value+32400000).toISOString().replace('T',' ').slice(0,19)+' JST':'不明';}
export function safeCell(value){const text=String(value??'');return /^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)?"'"+text:text;}
export function resultTables(snapshot,includeHidden=false,exportedAt=Date.now()){
 const meta=['授業名','授業ID','開催回','開催回ID','開催日時（日本時間）','出力日時（日本時間）','取得完了日時（日本時間）'];
 const values=[snapshot.title,snapshot.classId,snapshot.session.label||(snapshot.session.number??'不明'),snapshot.session.id,jst(snapshot.session.startedAt),jst(exportedAt),jst(snapshot.acquiredAt)];
 const table=(name,headers,data)=>({name,context:values,headers:[...meta,...headers],rows:data.map(r=>[...values,...r])});
 const visible=x=>includeHidden||x.published!==false;
 const hidden=x=>x.published===false?'非表示':'表示';
 const count=(votes,field,id)=>votes.filter(v=>v[field]===id).length;
 const questions=snapshot.questions.filter(visible).map(q=>[q.id,q.body,q.name||'匿名',jst(q.createdAt),count(snapshot.votes,'questionId',q.id),hidden(q)]);
 const prompts=snapshot.prompts.filter(visible);
 const polls=snapshot.polls.filter(visible);
 const summaries=[],responses=[];
 for(const p of polls){
  const total=p.responses.length;const type={single:'単一選択',multiple:'複数選択',text:'自由記述'}[p.type]||p.type;
  if(!p.options.length)summaries.push([p.id,p.title,type,'（自由記述・回答数）',total,total,'',hidden(p)]);
  p.options.forEach((option,index)=>{const n=p.responses.filter(r=>r.choices.includes(index)).length;summaries.push([p.id,p.title,type,option,n,total,total?n/total:0,hidden(p)]);});
  p.responses.forEach((r,i)=>responses.push([p.id,p.title,type,i+1,r.name||'匿名',jst(r.createdAt),r.text||'',r.choices.map(n=>p.options[n]).join('\n'),hidden(p)]));
 }
 return [
  table('質問',['質問ID','本文','表示名','投稿日時（日本時間）','共感数','非表示状態'],questions),
  table('自由記述設問',['設問ID','設問','作成日時（日本時間）','受付状態','非表示状態'],prompts.map(p=>[p.id,p.body,jst(p.createdAt),p.accepting?'受付中':'受付終了',hidden(p)])),
  table('自由記述回答',['設問ID','設問','回答ID','本文','表示名','投稿日時（日本時間）','共感数','設問の非表示状態','回答の非表示状態'],prompts.flatMap(p=>p.answers.filter(visible).map(a=>[p.id,p.body,a.id,a.body,a.name||'匿名',jst(a.createdAt),count(p.votes,'answerId',a.id),hidden(p),hidden(a)]))),
  table('追加の意見・コメント',['設問ID','設問','回答ID','回答本文','コメントID','本文','表示名','投稿日時（日本時間）','回答の非表示状態'],prompts.flatMap(p=>(p.comments||[]).filter(c=>p.answers.some(a=>a.id===c.answerId&&visible(a))).map(c=>[p.id,p.body,c.answerId,p.answers.find(a=>a.id===c.answerId)?.body||'',c.id,c.body,c.name||'匿名',jst(c.createdAt),hidden(p.answers.find(a=>a.id===c.answerId))]))),
  table('投票集計',['投票ID','設問','形式','選択肢','件数','回答者数','回答者に対する割合','非表示状態'],summaries),
  table('投票個別回答',['投票ID','設問','形式','回答番号','表示名','回答日時（日本時間）','自由記述','選択した選択肢','非表示状態'],responses),
  table('アンケート',['状態'],[['未実装：データなし']]),
  table('出力情報',['項目','内容'],[
   ['非表示データ',includeHidden?'含む':'含まない'],['取得方式','取得した個別回答を固定し、同じ回答から集計。全機能を横断した同一時刻のスナップショットではありません。'],
   ['削除済みデータ','削除された質問・設問・回答・投票およびその残存子データは復元・出力対象外。'],
   ['未回答','参加者名簿がないため未回答者を特定できません。回答0件は集計に0を記載。'],['未採点・出席','小テスト・採点・出席機能は未実装。得点や出席情報は出力しません。']
  ])
 ];
}
export function toCsv(table){return '\uFEFF'+[table.headers,...(table.rows.length?table.rows:[[...table.context,...Array(table.headers.length-table.context.length).fill('')]])].map(row=>row.map(x=>'"'+safeCell(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
export function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
