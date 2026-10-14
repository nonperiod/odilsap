import {createOperationGate} from './operation-gate';
import React,{useEffect,useRef,useState} from 'react';
import {createGoogleConnection,loadGoogle} from './google-export';
import {sessionName} from './domain';
import {resultTables,jst} from './results-domain';
import {authorizeResults} from './results-data';
export function GoogleExport({snapshot,includeHidden,current,user}){
 const [connection]=useState(()=>createGoogleConnection(import.meta.env.VITE_GOOGLE_CLIENT_ID));
 const [ready,setReady]=useState(false),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(null),[link,setLink]=useState(''),[selected,setSelected]=useState(['質問','自由記述設問','自由記述回答','追加の意見・コメント','投票集計','投票個別回答','出力情報']);
 const gate=useRef(null);if(!gate.current)gate.current=createOperationGate();
 const [title,setTitle]=useState(`${snapshot.title}・${sessionName(snapshot.session)}・結果 ${jst(Date.now())}`);
 useEffect(()=>{let live=true;loadGoogle().then(()=>{if(live)setReady(true);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;connection.clear();};},[]);
 const run=fn=>gate.current(async()=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);if(!connection.connected){setEmail('');setPreview(null);}}finally{setBusy(false);}});
 return <section><h3>Googleスプレッドシートへ手動出力</h3><p>接続したGoogleアカウントのマイドライブに、新しいファイルを作成します。共有範囲は作成後にGoogle側で確認できます。</p>
 <p>{email?`接続先：${email}`:'Google未接続'}</p><button disabled={!ready||busy} className="secondary" onClick={()=>run(async()=>{setPreview(null);setEmail(await connection.connect());})}>{email?'Googleに再接続':'Googleアカウントを接続'}</button>
 {email&&<button disabled={busy} className="secondary" onClick={()=>run(async()=>{setEmail('');setPreview(null);await connection.disconnect();})}>接続解除（Googleの許可も取消）</button>}
 <label>新しいファイル名<input value={title} maxLength={200} disabled={busy} onChange={e=>{setTitle(e.target.value);setPreview(null);}}/></label>
 <div>{resultTables(snapshot,includeHidden).map(t=><label key={t.name}><input type="checkbox" checked={selected.includes(t.name)} disabled={busy||t.name==='出力情報'} onChange={e=>{setPreview(null);setSelected(e.target.checked?[...selected,t.name]:selected.filter(n=>n!==t.name));}}/>{t.name}</label>)}</div>
 <button className="secondary" disabled={busy||!email||!title.trim()||selected.length<2} onClick={()=>{setLink('');setPreview({title:title.trim(),email,tables:structuredClone(resultTables(snapshot,includeHidden).filter(t=>selected.includes(t.name))),hidden:includeHidden});}}>出力先・項目を確認</button>
 {preview&&<div className="confirm"><b>新規スプレッドシートの作成内容</b><p>出力先：{preview.email} のマイドライブ<br/>ファイル名：{preview.title}<br/>授業：{snapshot.title} ／ 開催回ID：{snapshot.session.id}<br/>非表示データ：{preview.hidden?'含む':'含まない'}</p><ul>{preview.tables.map(t=><li key={t.name}>{t.name}：{t.rows.length}件。項目：{t.headers.join('、')}</li>)}</ul><p>取得済みの結果を出力します。既存ファイルの上書きと自動同期は行いません。</p>
 <button className="primary" disabled={busy} onClick={()=>run(async()=>{await authorizeResults(current,user);const file=await connection.create(preview.title,preview.tables.map(t=>({...t,rows:t.rows.map(r=>r.map((v,i)=>i===5?jst(Date.now()):v))})));setLink(`https://docs.google.com/spreadsheets/d/${file.spreadsheetId}/edit`);setPreview(null);})}>確認した内容で新規作成</button><button className="secondary" disabled={busy} onClick={()=>setPreview(null)}>取消</button></div>}
 {error&&<p className="error" role="alert">{error} 通信エラーの場合は、作成済みファイルがないかGoogle Driveで確認してから再試行してください。</p>}
 {link&&<p role="status">作成しました：<a href={link} target="_blank" rel="noreferrer">スプレッドシートを開く ↗</a></p>}
 </section>;
}
