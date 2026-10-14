const scope='https://www.googleapis.com/auth/drive.file openid email';
let loading;
export function loadGoogle(){
 if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
 if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>resolve();script.onerror=()=>{loading=null;script.remove();reject(new Error('Google認証を読み込めません。通信とブラウザ設定を確認してください。'));};document.head.append(script);});
 return loading;
}
export function googlePayload(title,tables){
 return {properties:{title,locale:'ja_JP',timeZone:'Asia/Tokyo'},sheets:tables.map((t,id)=>({
  properties:{sheetId:id,title:t.name,gridProperties:{rowCount:Math.max(10,t.rows.length+1),columnCount:t.headers.length,frozenRowCount:1}},
  data:[{rowData:[t.headers,...t.rows].map((row,index)=>({values:row.map(value=>({
   userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')},
   userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP',...(index===0?{backgroundColor:{red:.16,green:.35,blue:.30},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}:{})}
  }))})),columnMetadata:t.headers.map(h=>({pixelSize:/本文|設問$|自由記述$|内容/.test(h)?420:/日時/.test(h)?230:180}))}]
 }))};
}
// Each mounted admin panel has its own in-memory token. No local/session
// storage, refresh token, Firebase credential replacement or client secret.
export function createGoogleConnection(clientId){
 let token='',expires=0,email='',generation=0;
 const clear=()=>{generation++;token='';expires=0;email='';};
 const api=async(url,options={})=>{
  if(!token||Date.now()>=expires){clear();throw new Error('Googleの認証期限が切れました。再接続してください。');}
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
  if(response.status===401){clear();throw new Error('Google認証が無効です。再接続してください。');}
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(`Google APIエラー (${response.status})：${data.error?.message||'API設定・権限・利用上限を確認してください。'}`);}
  return response.json();
 };
 return {
  clear,
  get connected(){return !!token&&Date.now()<expires;},
  get email(){return email;},
  connect(){
   if(!clientId)return Promise.reject(new Error('VITE_GOOGLE_CLIENT_IDが未設定です。READMEのGoogle設定手順を確認してください。'));
   const attempt=++generation;
   return new Promise((resolve,reject)=>{
    const client=globalThis.google.accounts.oauth2.initTokenClient({client_id:clientId,scope,error_callback:()=>reject(new Error('Google接続を完了できませんでした。ポップアップを許可して再接続してください。')),callback:async response=>{
     if(attempt!==generation){reject(new Error('接続を取り消しました。'));return;}
     if(response.error||!response.access_token||!globalThis.google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){clear();reject(new Error('必要なGoogleアクセス権を許可して再接続してください。'));return;}
     token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000-30000;
     try{const info=await api('https://www.googleapis.com/oauth2/v3/userinfo');if(attempt!==generation)throw new Error('接続を取り消しました。');if(!info.email)throw new Error('接続先のメールアドレスを確認できません。メール情報の許可を確認して再接続してください。');email=info.email;resolve(email);}catch(e){clear();reject(e);}
    }});
    client.requestAccessToken({prompt:'consent'});
   });
  },
  async disconnect(){
   const previous=token;clear();if(!previous)return;
   await new Promise((resolve,reject)=>globalThis.google.accounts.oauth2.revoke(previous,response=>response.successful?resolve():reject(new Error('画面の接続は解除しましたが、Google側の許可取消に失敗しました。Googleアカウントの接続済みアプリから解除してください。'))));
  },
  async create(title,tables){return api('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',body:JSON.stringify(googlePayload(title,tables))});}
 };
}
