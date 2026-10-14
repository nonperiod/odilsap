import React,{useState} from 'react';

export function PromptTextEditor({value,busy,save}){
 const [editing,setEditing]=useState(false),[body,setBody]=useState(value);
 if(!editing)return <button className="secondary" disabled={busy} onClick={()=>{setBody(value);setEditing(true);}}>設問の表示文章を編集</button>;
 return <form className="prompt-form" onSubmit={async e=>{e.preventDefault();if(await save(body))setEditing(false);}}>
 <label>設問の表示文章<textarea required rows={4} maxLength={1000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></label>
 <p>保存すると学生画面にも反映されます。既存の回答・共感・集計は保持されます。</p>
 <div className="heading-actions"><button className="primary" disabled={busy||!body.trim()}>表示文章を保存</button><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(false)}>キャンセル</button></div>
 </form>;
}
