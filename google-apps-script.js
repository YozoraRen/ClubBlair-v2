/**
 * ClubBlair 統合管理スクリプト (v2)
 * 機能: 伝票管理 / キャスト管理 / タイムカード / ステータス管理
 */

// シート名の定義
const SHEET_SLIP = 'Slip';         // 伝票データ
const SHEET_CONFIG = 'Config';     // キャスト設定
const SHEET_TIMECARD = 'TimeCard'; // タイムカード

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 伝票データの取得
  let slipSheet = ss.getSheetByName(SHEET_SLIP);
  if (!slipSheet) {
    slipSheet = ss.insertSheet(SHEET_SLIP);
    slipSheet.appendRow(['id', 'date', 'name1', 'name2', 'name3', 'total', 'set', 'mine_ice', 'created_at']);
  }
  
  const slipRows = slipSheet.getDataRange().getValues();
  const headers = slipRows[0];
  const entries = [];
  
  for (let i = 1; i < slipRows.length; i++) {
    const row = slipRows[i];
    if (row[0] === '') continue; // IDがない行はスキップ
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index];
    });
    entries.push(entry);
  }

  // 2. キャスト一覧の取得
  let configSheet = ss.getSheetByName(SHEET_CONFIG);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CONFIG);
    configSheet.appendRow(['key', 'value']); // Header
    configSheet.appendRow(['cast', 'サンプル']); // Initial data
  }
  
  const configRows = configSheet.getDataRange().getValues();
  const casts = [];
  for (let i = 1; i < configRows.length; i++) {
    if (configRows[i][0] === 'cast' && configRows[i][1]) {
      casts.push(configRows[i][1]);
    }
  }

  // 3. タイムカードのステータス取得 (各キャストの最終打刻を確認)
  let timeCardSheet = ss.getSheetByName(SHEET_TIMECARD);
  const castStatuses = {}; // { "名前": "clock_in" | "clock_out" }

  if (timeCardSheet) {
    const timeRows = timeCardSheet.getDataRange().getValues();
    // 1行目はヘッダーなのでスキップ。古い順に並んでいる前提で下から見るか、上から順に更新するか
    // 上から順に見ていき、最新の状態を上書きしていく
    for (let i = 1; i < timeRows.length; i++) {
      // 想定カラム: [日時, 名前, 種別, 同伴, 打刻時間, raw_type]
      // raw_type (clock_in/clock_out) をF列(index 5)に保存するようにdoPostで設定します
      // もし既存データにraw_typeがない場合は、C列(index 2)の日本語から判定
      const name = timeRows[i][1];
      const typeJa = timeRows[i][2]; // 出勤 or 退勤
      
      let status = 'clock_out';
      if (typeJa === '出勤') status = 'clock_in';
      if (typeJa === '退勤') status = 'clock_out';
      
      if (name) {
        castStatuses[name] = status;
      }
    }
  }

  const response = {
    status: 'success',
    data: entries,
    meta: {
      casts: casts,
      cast_statuses: castStatuses
    }
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const action = json.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- タイムカード処理 ---
    if (action === 'timecard') {
      let sheet = ss.getSheetByName(SHEET_TIMECARD);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_TIMECARD);
        sheet.appendRow(['日時', '名前', '種別', '同伴', '打刻時間', 'raw_type']);
      }
      
      const timestamp = new Date();
      const dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
      const timeStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'HH:mm');
      
      sheet.appendRow([
        dateStr,
        json.name,
        json.type === 'clock_in' ? '出勤' : '退勤',
        json.withGuest ? 'あり' : '-',
        timeStr,
        json.type // clock_in or clock_out (システム判定用)
      ]);
      
      return responseJSON({ status: 'success', message: 'Recorded' });
    }

    // --- キャスト管理処理 ---
    if (action === 'manage_cast') {
      const sheet = ss.getSheetByName(SHEET_CONFIG);
      if (json.sub_action === 'add') {
        sheet.appendRow(['cast', json.name]);
      } else if (json.sub_action === 'delete') {
        const rows = sheet.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i][0] === 'cast' && rows[i][1] === json.name) {
            sheet.deleteRow(i + 1);
          }
        }
      }
      return responseJSON({ status: 'success' });
    }

    // --- 伝票データ処理 (create/update/delete) ---
    let sheet = ss.getSheetByName(SHEET_SLIP);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_SLIP);
      sheet.appendRow(['id', 'date', 'name1', 'name2', 'name3', 'total', 'set', 'mine_ice', 'created_at']);
    }

    if (action === 'create') {
      const id = new Date().getTime().toString(); // Simple ID
      const data = json.data;
      const createdAt = new Date().toISOString();
      
      sheet.appendRow([
        id, "'"+data.date, data.name1, data.name2, data.name3, 
        data.total, data.set, data.mine_ice, createdAt
      ]);
      
      return responseJSON({ status: 'success', id: id });
    }
    
    if (action === 'update') {
      const id = json.id;
      const data = json.data;
      const rows = sheet.getDataRange().getValues();
      
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(id)) {
          // ID, Date, Names...
          // Update columns (index 1 to 7)
          sheet.getRange(i + 1, 2).setValue("'"+data.date);
          sheet.getRange(i + 1, 3).setValue(data.name1);
          sheet.getRange(i + 1, 4).setValue(data.name2);
          sheet.getRange(i + 1, 5).setValue(data.name3);
          sheet.getRange(i + 1, 6).setValue(data.total);
          sheet.getRange(i + 1, 7).setValue(data.set);
          sheet.getRange(i + 1, 8).setValue(data.mine_ice);
          return responseJSON({ status: 'success' });
        }
      }
      return responseJSON({ status: 'error', message: 'ID not found' });
    }
    
    if (action === 'delete') {
      const id = json.id;
      const rows = sheet.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][0]) === String(id)) {
          sheet.deleteRow(i + 1);
          return responseJSON({ status: 'success' });
        }
      }
      return responseJSON({ status: 'error', message: 'ID not found' });
    }

    return responseJSON({ status: 'error', message: 'Invalid action' });

  } catch (e) {
    return responseJSON({ status: 'error', message: e.toString() });
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
