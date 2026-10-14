export function normalizePoll(input) {
 const title=String(input.title||'').trim(), type=input.type;
 if(!title||title.length>1000)throw new Error('投票の設問は1〜1000文字で入力してください。');
 if(!['single','multiple','text'].includes(type))throw new Error('設問の形式を選んでください。');
 const options=type==='text'?[]:(input.options||[]).map(x=>String(x).trim());
 if(type!=='text'&&(options.length<2||options.length>8||options.some(x=>!x||x.length>100)||new Set(options).size!==options.length))throw new Error('選択肢は重複のない2〜8件、各100文字以内で入力してください。');
 return {title,type,options};
}
export function normalizeSubmission(poll,input) {
 const name=String(input.name||'').trim();if(name.length>40)throw new Error('名前は40文字以内にしてください。');
 if(poll.type==='text'){const text=String(input.text||'').trim();if(!text||text.length>1000)throw new Error('回答は1〜1000文字で入力してください。');return {name,text,choices:[]};}
 const choices=input.choices;
 if(!Array.isArray(choices)||!choices.length||choices.length>poll.options.length||new Set(choices).size!==choices.length||choices.some(x=>!Number.isInteger(x)||x<0||x>=poll.options.length)||(poll.type==='single'&&choices.length!==1))throw new Error('有効な選択肢を選んでください。');
 return {name,text:'',choices:[...choices].sort((a,b)=>a-b)};
}
export function addToAggregate(poll,aggregate,answer){
 const counts=aggregate?.counts||poll.options.map(()=>0);
 return {responseCount:(aggregate?.responseCount||0)+1,counts:counts.map((n,i)=>n+(answer.choices.includes(i)?1:0))};
}
