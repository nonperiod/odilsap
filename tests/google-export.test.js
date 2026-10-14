import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googlePayload,createGoogleConnection} from '../src/google-export.js';
test('Sheets payload creates typed literal data with no formula values',()=>{
 const payload=googlePayload('日本語',[{name:'回答',headers:['本文','数'],rows:[['=1+2\n日本語',2]]}]);
 assert.equal(payload.properties.timeZone,'Asia/Tokyo');
 const cells=payload.sheets[0].data[0].rowData[1].values;
 assert.deepEqual(cells[0].userEnteredValue,{stringValue:'=1+2\n日本語'});assert.deepEqual(cells[1].userEnteredValue,{numberValue:2});assert.ok(!JSON.stringify(payload).includes('formulaValue'));
});
test('Connection creates only new files, recovers after auth failure and revokes on disconnect',async()=>{
 const originalGoogle=globalThis.google,originalFetch=globalThis.fetch;
 let options,revoked='',status=200,calls=[];
 globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:o=>{options=o;return {requestAccessToken:()=>o.callback({access_token:'test-token',expires_in:3600})};},revoke:(token,callback)=>{revoked=token;callback({successful:true});}}}};
 globalThis.fetch=async(url,input)=>{calls.push({url,input});return {status,ok:status===200,json:async()=>url.includes('userinfo')?{email:'teacher@example.test'}:{spreadsheetId:'new-file'}};};
 try{
  const connection=createGoogleConnection('public-client-id');assert.equal(await connection.connect(),'teacher@example.test');assert.ok(connection.connected);assert.ok(options.scope.includes('drive.file'));
  const file=await connection.create('確認済み',[]);assert.equal(file.spreadsheetId,'new-file');assert.equal(calls.at(-1).url,'https://sheets.googleapis.com/v4/spreadsheets');assert.equal(calls.at(-1).input.method,'POST');
  status=401;await assert.rejects(connection.create('test',[]),/再接続/);assert.equal(connection.connected,false);status=200;await connection.connect();await connection.disconnect();assert.equal(revoked,'test-token');assert.equal(connection.connected,false);
  await assert.rejects(connection.create('test',[]),/再接続/);await assert.rejects(createGoogleConnection('').connect(),/未設定/);
 }finally{globalThis.google=originalGoogle;globalThis.fetch=originalFetch;}
});
