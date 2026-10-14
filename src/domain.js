export function cleanTitle(value) { const title = value.trim(); if (!title || title.length > 100) throw new Error('授業名は1〜100文字で入力してください。'); return title; }
export function cleanQuestion(value) { const body = value.trim(); if (!body || body.length > 1000) throw new Error('質問は1〜1000文字で入力してください。'); return body; }
export function rankQuestions(questions, votes, order) { const counts = {}; votes.forEach(v => { counts[v.questionId] = (counts[v.questionId] || 0) + 1; }); return questions.map(q => ({...q, count: counts[q.id] || 0})).sort((a,b) => order === 'popular' ? b.count - a.count || b.createdAt - a.createdAt : b.createdAt - a.createdAt); }
export function sessionDateInput(timestamp) { return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0,16); }
export function parseSessionDate(value) {
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
 if(!match)throw new Error('開催日時を入力してください。');
 const seconds=match[2]||'00',milliseconds=(match[3]||'').padEnd(3,'0');
 const timestamp=Date.parse(`${match[1]}:${seconds}.${milliseconds}+09:00`);
 if(!Number.isFinite(timestamp)||Number(seconds)>59||sessionDateInput(timestamp)!==match[1])throw new Error('有効な開催日時を入力してください。');
 return timestamp;
}
export function paginateQuestions(questions,page,size=10){const totalPages=Math.max(1,Math.ceil(questions.length/size));const currentPage=Math.max(1,Math.min(page,totalPages));return {totalPages,currentPage,items:questions.slice((currentPage-1)*size,currentPage*size)};}
export function cleanResponse(value,label='回答') { const body=value.trim(); if(!body||body.length>1000)throw new Error(`${label}は1〜1000文字で入力してください。`); return body; }
export function rankAnswers(answers,votes,order){return rankQuestions(answers,votes.map(v=>({...v,questionId:v.answerId})),order);}

export function sessionName(session){const number=session.number??session.sessionNumber;return session.label||session.sessionLabel||(number?`第 ${number} 回`:'開催回番号不明');}
