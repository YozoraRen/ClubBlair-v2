# 伝票入力アプリ (Slip Entry# ClubBlair 伝票入力アプリ (OCR対応版)

Gemini AIを使用したOCR機能付き伝票入力・管理アプリケーションです。

## 新機能

### 📸 AI OCR機能
- **伝票撮影**: カメラで伝票を撮影
- **自動解析**: Gemini 1.5 Flash APIで伝票内容を自動認識
- **自動入力**: 認識した情報をフォームに自動入力

### 使い方
1. 伝票入力画面でカメラアイコンをタップ
2. 伝票を撮影
3. 「解析する」ボタンをタップ
4. AIが自動的に情報を抽出してフォームに入力

## 技術仕様

- **AI Model**: Gemini 1.5 Flash
- **API**: Google Generative AI API
- **対応ブラウザ**: カメラAPIをサポートする最新ブラウザ

Googleスプレッドシートと連携し、キャスト一覧をシートで管理できます。

## セットアップ手順

### 1. Google Apps Script (GAS) の設定
1. Google スプレッドシートを新規作成（または既存のものを使用）します。
2. 上部メニューの **拡張機能** > **Apps Script** をクリックします。
3. エディタが開くので、デフォルトのコードを削除し、`Code.gs` の内容をすべて貼り付けます。
4. **一度 `setup` 関数を実行してください**:
   - 上部の関数選択プルダウンから `setup` を選び「実行」を押します。
   - 権限確認が表示されるので「承認」します。
   - これにより、シート「伝票入力アプリ」と「設定」が自動作成されます。
5. **デプロイ**:
    - **デプロイ** > **新しいデプロイ** をクリックします。
    - **種類の選択**: ウェブアプリ
    - **説明**: `v2` など
    - **次のユーザーとして実行**: `自分` (Me)
    - **アクセスできるユーザー**: `全員` (Anyone) ※重要
    - **デプロイ** をクリック。
6. 発行された **ウェブアプリのURL** をコピーします。

### 2. キャストの設定
1. スプレッドシートの「**設定**」シートを開きます。
2. **B列**の2行目以降にキャスト名を入力してください（例: さくら, ひな...）。
3. アプリをリロードすると、入力フォームのキャスト選択肢に反映されます。

### 3. アプリの起動
1. フォルダ内の `index.html` をブラウザで開きます。
2. 初回設定画面でJSステップ1-6の **ウェブアプリURL** を入力します。

## 機能
- **新規登録**: 日付、キャスト（最大3名）、金額、セット内容などを記録。
- **履歴表示**: 最新の伝票一覧を表示。
- **キャスト管理**: スプレッドシートでキャスト名を追加・変更するだけでアプリに自動反映。

## Cloudflare Pages Deployment

This application has been ported to Cloudflare Pages.

### URL
- **Production**: https://club-blair.pages.dev

### Deployment Steps
1. The project uses Hono + Vite for the build process.
2. Static assets are in `public/`.
3. The app is served via Cloudflare Pages.

### Configuration
- **GAS URL**: Configured in `script.js`.
- **Gemini API Key**: Configured in `ocr.js`.

To redeploy:
```bash
npm run deploy
```
