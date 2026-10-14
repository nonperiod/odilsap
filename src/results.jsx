import {createOperationGate} from './operation-gate';
import React,{useEffect,useRef,useState} from 'react';
import {listSessions,loadResults,authorizeResults} from './results-data';
import {renameSession} from './data';
import {sessionName} from './domain';
import {GoogleExport} from './google-export.jsx';
import {resultTables,jst,toCsv,download} from './results-domain';
export function Results({current,user}){
 const [sessions,setSessions]=useState([]),[sid,setSid]=useState(current.activeSessionId),[legacy,setLegacy]=useState(''),[snapshot,setSnapshot]=useState(null),[hidden,setHidden]=useState(false),[tab,setTab]=useState('質問'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editingName,setEditingName]=useState(false),[label,setLabel]=useState('');
 const gate=useRef(null);if(!gate.current)gate.current=createOperationGate();
 useEffect(()=>{let live=true;listSessions(current,user).then(v=>{if(live)setSessions(v);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[current.activeSessionId,current.sessionStartedAt,current.sessionLabel]);
 useEffect(()=>{setSnapshot(old=>old?{...old,title:current.title,session:old.session.id===current.activeSessionId?{...old.session,label:current.sessionLabel||'',startedAt:current.sessionStartedAt}:old.session}:null);},[current.title,current.sessionLabel,current.sessionStartedAt]);
 const fetchResults=()=>gate.current(async()=>{setBusy(true);setError('');setSnapshot(null);try{setSnapshot(await loadResults(current,sessions.find(s=>s.id===sid)||{id:sid,number:null,startedAt:null},user));}catch(e){setError(e.message);}finally{setBusy(false);}});
 const tables=snapshot?resultTables(snapshot,hidden):[];
 const active=tables.find(t=>t.name===tab)||tables[0];
 return <section className="card results"><h2>過去の開催回・やり取りを確認</h2><p>左の一覧で授業を選択し、開催回を指定して結果を取得してください。再取得するまで結果を固定します。</p>
 <label>開催回<select value={sid} disabled={busy} onChange={e=>{setSid(e.target.value);setSnapshot(null);setEditingName(false);}}>{sessions.map(s=><option key={s.id} value={s.id}>{sessionName(s)} — {jst(s.startedAt)}{!s.number?` — ${s.id}`:''}</option>)}{!sessions.some(s=>s.id===sid)&&<option value={sid}>履歴ID：{sid}</option>}</select></label>
 <button className="secondary" disabled={busy} onClick={()=>{setLabel(sessionName(sessions.find(s=>s.id===sid)||{id:sid}));setEditingName(true);}}>選択した開催回名を変更</button>
 {editingName&&<form className="date-editor" onSubmit={async e=>{e.preventDefault();await gate.current(async()=>{setBusy(true);setError('');try{await renameSession(current,{id:sid},label,user);const next=await listSessions(current.activeSessionId===sid?{...current,sessionLabel:label}:current,user);setSessions(next);setSnapshot(old=>old?{...old,session:{...old.session,label}}:null);setEditingName(false);}catch(e){setError(e.message);}finally{setBusy(false);}});}}><label>選択した開催回の表示名<input value={label} maxLength={100} required onChange={e=>setLabel(e.target.value)}/></label><button className="primary" disabled={busy||!label.trim()}>開催回名を保存</button><button type="button" className="secondary" disabled={busy} onClick={()=>setEditingName(false)}>取消</button></form>}
 <details><summary>旧データの開催回IDを指定</summary><p>第5段階以前の履歴は番号・日時が保存されていない場合があります。既存IDはFirebase Consoleのデータから確認できます。存在しないIDも空データとして表示されます。</p><input aria-label="旧開催回ID" value={legacy} onChange={e=>setLegacy(e.target.value)}/><button disabled={busy||!legacy.trim()} onClick={()=>{setSid(legacy.trim());setSnapshot(null);setEditingName(false);}}>このIDを選択</button></details>
 <button className="primary" disabled={busy} onClick={fetchResults}>{busy?'取得中…':'結果を取得／更新'}</button>
 <label><input type="checkbox" checked={hidden} onChange={e=>setHidden(e.target.checked)}/>非表示データを含める</label>
 {error&&<p role="alert" className="error">{error}</p>}
 <p>アンケート・小テスト・採点・出席は未実装です。削除済みの親データとその残存子データは出力できません。匿名の表示名は「匿名」とし、UIDから名前を補いません。</p>
 {snapshot&&<><p>取得完了：{jst(snapshot.acquiredAt)} ／ {snapshot.title} ／ {sessionName(snapshot.session)}</p><div className="heading-actions">{tables.map(t=><button key={t.name} className={tab===t.name?'primary':'secondary'} onClick={()=>setTab(t.name)}>{t.name}</button>)}</div>
 <button className="secondary" disabled={busy} onClick={()=>gate.current(async()=>{setBusy(true);setError('');try{await authorizeResults(current,user);download(toCsv(resultTables(snapshot,hidden).find(t=>t.name===active.name)),`odilsap-${snapshot.classId}-${snapshot.session.id}-${active.name}.csv`,'text/csv;charset=utf-8');}catch(e){setError(e.message);}finally{setBusy(false);}})}>表示中の機能をCSVで保存</button><button className="secondary" disabled={busy} onClick={()=>gate.current(async()=>{setBusy(true);setError('');try{await authorizeResults(current,user);const {toExcel}=await import('./results-excel');download(await toExcel(resultTables(snapshot,hidden)),`odilsap-${snapshot.classId}-${snapshot.session.id}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(e){setError(e.message);}finally{setBusy(false);}})}>全機能をExcelで保存</button><div className="results-scroll"><table><thead><tr>{active.headers.slice(7).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{active.rows.map((r,i)=><tr key={i}>{r.slice(7).map((v,j)=><td key={j}>{active.headers[j+7]?.includes('割合')&&typeof v==='number'?`${(v*100).toFixed(1)}%`:v}</td>)}</tr>)}</tbody></table>{!active.rows.length&&<p>データはありません。出力ファイルには項目名を含めます。</p>}</div><GoogleExport key={snapshot.acquiredAt+':'+hidden+':'+snapshot.title+':'+(snapshot.session.label||'')} snapshot={snapshot} includeHidden={hidden} current={current} user={user}/></>}
 </section>;
}
