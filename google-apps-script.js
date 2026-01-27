/**
 * ClubBlair タイムカード連携スクリプト
 * 
 * 手順:
 * 1. 新しいGoogleスプレッドシートを作成し、シート名を「TimeCard」に変更してください。
 * 2. 1行目にヘッダーを作成してください: A1「日時」, B1「名前」, C1「種別」, D1「同伴」, E1「打刻時間」
 * 3. 拡張機能 > Apps Script を開き、このコードを貼り付けてください。
 * 4. 「デプロイ」>「新しいデプロイ」> 種類の選択「ウェブアプリ」
 *    - 説明: TimeCard API
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 5. 発行された「ウェブアプリのURL」をコピーして、ClubBlairアプリの設定画面に入力してください。
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('TimeCard');
    
    // シートがない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('TimeCard');
      sheet.appendRow(['日時', '名前', '種別', '同伴', '打刻時間']);
    }
    
    const timestamp = new Date();
    const dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    
    // データ形式: { name: "名前", type: "出勤/退勤", withGuest: true/false }
    sheet.appendRow([
      dateStr,
      data.name,
      data.type === 'clock_in' ? '出勤' : '退勤',
      data.withGuest ? 'あり' : '-',
      data.time || Utilities.formatDate(timestamp, 'Asia/Tokyo', 'HH:mm')
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Recorded' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
