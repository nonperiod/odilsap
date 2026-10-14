# リポジトリの作業ルール

- ファイルの変更内容・検証結果は、ローカルの `changelog.md` に記録する。README.md に変更履歴を追記しない。
- README.md は第三者向けの概要と試用・設定手順を記載し、設定例にはダミー値だけを使う。
- `.env*`、`.firebaserc`、`firebase.json`、`firestore.rules`、`docs/`、`changelog.md` など、.gitignore で除外したファイルは追跡・コミット・push しない。強制追加もしない。
- Firebase の接続実値・秘密鍵・トークンを公開ファイルに記載しない。アプリ本体は環境変数から設定を読み込む。
- Hosting の公開ディレクトリは `dist` とし、ローカル設定・文書をコピーしない。Firestore ルールの適用は Hosting ファイルの配信とは別であり、GitHub 公開作業に伴って自動でデプロイしない。
