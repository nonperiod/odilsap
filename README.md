# odilsap

授業中の質問や意見をリアルタイムに共有する、React と Firebase を使った授業参加支援アプリです。固定URL・QRコードからの参加、質問と共感、自由記述とコメント、ライブ投票、投影、過去の結果の閲覧と CSV・Excel・Googleスプレッドシートへの出力に対応しています。アンケート・小テスト・出席管理は未実装です。

## デモを試す

Node.js 20以上と npm を用意し、次を実行します。

```sh
git clone https://github.com/nonperiod/odilsap.git
cd odilsap
npm ci
npm run dev
```

`http://localhost:5173` を開き、「デモを始める」から授業を作成します。「参加画面を開く」で別タブから投稿を試せます。Firebase の環境変数を設定しなければデモモードになります。

デモのデータはブラウザの localStorage に保存され、同じブラウザ・同じオリジンのタブ間で同期します。別端末との共有や Firebase の権限制御の検証には対応しません。

## 自分の Firebase に接続する場合の設定例

以下はすべてダミー値です。そのままでは接続できません。デモを試すだけなら設定は不要です。

自分の Firebase プロジェクトで Web アプリと Cloud Firestore を用意し、Authentication の「メール / パスワード」と「匿名」を有効にします。自分の Web アプリの構成値を、手元で作成する `.env.local` に設定してください。

```dotenv
VITE_FIREBASE_API_KEY=YOUR_DUMMY_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=your-demo-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-demo-project
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
```

保存後は開発サーバーを再起動します。`VITE_` で始まる値はビルドしたブラウザ用コードに含まれます。サービスアカウントの秘密鍵、クライアントシークレット、アクセストークンは設定しないでください。

`firebase.json`、`firestore.rules`、`.env.example` はこのリポジトリに含まれていません。Firebase で実データを利用するには、授業の所有者・参加者の権限や受付状態を検証する、本アプリに対応した Firestore ルールを別途用意して反映する必要があります。データベースを全公開するルールは使用しないでください。

Hosting を使う場合のローカル設定例です。これは Hosting のみの例で、Firestore ルールの設定・公開は別途必要です。

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["**/.*", "**/node_modules/**", "firebase.json", "firestore.rules", "docs/**", "changelog.md"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

自分の環境では `npm run build` で `dist` を生成します。Firebase の公開先は自分のプロジェクトを明示して設定してください。ローカルの接続設定や文書は Hosting の公開ディレクトリにコピーしないでください。

## Googleスプレッドシートへの出力（任意）

自分の Google Cloud プロジェクトで Sheets API を有効にし、Web アプリケーション用の OAuth クライアントを作成します。承認済み JavaScript 生成元に `http://localhost:5173` と自分の公開元を登録してください。

`.env.local` に追加するダミー例：

```dotenv
VITE_GOOGLE_CLIENT_ID=000000000000-your-dummy-client-id.apps.googleusercontent.com
```

実際には自分のクライアントIDに置き換え、開発サーバーを再起動してください。Google 出力では接続と出力内容の確認後に新しいスプレッドシートを作成します。クライアントシークレットは使いません。
