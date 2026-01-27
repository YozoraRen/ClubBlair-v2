/**
 * Config
 */
const SHEET_NAME = "伝票入力アプリ";
const SETTINGS_SHEET_NAME = "設定";
const TIMECARD_SHEET_NAME = "TimeCard"; // 追加: タイムカード用シート名

/**
 * Initial setup - run this once to setup headers
 */
function setup() {
    const doc = SpreadsheetApp.getActiveSpreadsheet();

    // Setup Main Sheet
    let sheet = doc.getSheetByName(SHEET_NAME);
    if (!sheet) {
        sheet = doc.insertSheet(SHEET_NAME);
        const headers = [
            "ID",
            "日付",
            "キャスト①",
            "キャスト②",
            "キャスト③",
            "合計",
            "セット",
            "ミネ・アイス",
            "Created At",
            "Updated At"
        ];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
    } else {
        // Ensure cast headers are updated if migrated from old version
        sheet.getRange(1, 3).setValue("キャスト①");
        sheet.getRange(1, 4).setValue("キャスト②");
        sheet.getRange(1, 5).setValue("キャスト③");
    }

    // Setup Settings Sheet
    let settingsSheet = doc.getSheetByName(SETTINGS_SHEET_NAME);
    if (!settingsSheet) {
        settingsSheet = doc.insertSheet(SETTINGS_SHEET_NAME);
        // User requested Column B (index 2)
        settingsSheet.getRange(1, 2).setValue("キャスト名一覧");
        settingsSheet.getRange(2, 2, 3, 1).setValues([["さくら"], ["ひな"], ["みあ"]]);
    }

    // 追加: Setup TimeCard Sheet
    let timeCardSheet = doc.getSheetByName(TIMECARD_SHEET_NAME);
    if (!timeCardSheet) {
        timeCardSheet = doc.insertSheet(TIMECARD_SHEET_NAME);
        timeCardSheet.appendRow(['日時', '名前', '種別', '同伴', '打刻時間', 'raw_type']);
        timeCardSheet.setFrozenRows(1);
    }
}

/**
 * Handle GET requests - Read all data
 */
function doGet(e) {
    return handleResponse(() => {
        const data = getData();
        const casts = getCasts();
        const castStatuses = getCastStatuses(); // 追加: ステータス取得
        const timeCardLogs = getTimeCardLogs(); // 追加: タイムカード履歴取得

        return {
            status: 'success',
            data: data,
            meta: {
                casts: casts,
                cast_statuses: castStatuses, // 追加
                timecard_logs: timeCardLogs // 追加
            }
        };
    });
}

/**
 * Get list of casts from Settings sheet (Column B)
 */
function getCasts() {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return []; // Only header or empty

    // Read Column B (2) from row 2
    const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    // Flatten and filter empty
    return values.map(r => r[0]).filter(c => c !== "");
}

/**
 * 追加: Get cast statuses from TimeCard sheet
 */
function getCastStatuses() {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(TIMECARD_SHEET_NAME);
    const statuses = {};
    
    if (!sheet) return statuses;
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return statuses;

    const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    
    // 上から順に走査してステータスを更新（最新の状態にする）
    for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const name = row[1]; // 名前
        const rawType = row[5]; // raw_type (clock_in/clock_out)
        
        // raw_typeがない場合の互換性維持
        let status = 'clock_out';
        if (rawType) {
            status = rawType;
        } else {
            const typeJa = row[2];
            if (typeJa === '出勤') status = 'clock_in';
        }
        
        if (name) {
            statuses[name] = status;
        }
    }
    return statuses;
}

/**
 * 追加: Get all TimeCard logs
 */
function getTimeCardLogs() {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(TIMECARD_SHEET_NAME);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // Read all logs
    // Columns: 日時, 名前, 種別, 同伴, 打刻時間, raw_type
    const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    
    return values.map(row => {
        // 日時 (row[0]) を文字列にフォーマット
        let dateStr = row[0];
        if (row[0] instanceof Date) {
            dateStr = Utilities.formatDate(row[0], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        }

        // 打刻時間 (row[4]) も必要ならフォーマット（今回はメインの日時を使うため補助的）
        let timeStr = row[4];
        if (row[4] instanceof Date) {
            timeStr = Utilities.formatDate(row[4], 'Asia/Tokyo', 'HH:mm');
        }

        return {
            date: dateStr, // "yyyy-MM-dd HH:mm:ss"
            name: row[1],
            type_label: row[2],
            with_guest: row[3],
            time: timeStr,
            type: row[5]
        };
    }).reverse(); // 新しい順
}

/**
 * Handle POST requests - Create, Update, Delete, Manage Cast, TimeCard
 */
function doPost(e) {
    return handleResponse(() => {
        // Determine action from query param or body
        let payload = {};
        if (e.postData && e.postData.contents) {
            try {
                payload = JSON.parse(e.postData.contents);
            } catch (err) {
                payload = e.parameter;
            }
        } else {
            payload = e.parameter;
        }

        const action = payload.action;

        if (action === 'create') {
            return createItem(payload.data);
        } else if (action === 'update') {
            return updateItem(payload.id, payload.data);
        } else if (action === 'delete') {
            return deleteItem(payload.id);
        } else if (action === 'manage_cast') {
            return manageCast(payload.sub_action, payload.name);
        } else if (action === 'timecard') { // 追加: タイムカード処理
            return recordTimeCard(payload);
        } else {
            throw new Error('Invalid action: ' + action);
        }
    });
}

/**
 * 追加: Record TimeCard
 */
function recordTimeCard(json) {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(TIMECARD_SHEET_NAME);
    
    if (!sheet) {
        // もしシートがなければ作成
        sheet = doc.insertSheet(TIMECARD_SHEET_NAME);
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
        json.type // clock_in or clock_out
    ]);
    
    return { status: 'success', message: 'Recorded' };
}

/**
 * Read all data from the sheet
 */
function getData() {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    const data = [];

    if (lastRow < 2) return data;

    // Read data range excluding header
    const rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const record = {};
        // ID is at index 0
        record['id'] = row[0];
        record['date'] = row[1];
        record['name1'] = row[2]; // Cast 1
        record['name2'] = row[3]; // Cast 2
        record['name3'] = row[4]; // Cast 3
        record['total'] = row[5];
        record['set'] = row[6];
        record['mine_ice'] = row[7];
        record['created_at'] = row[8]; // Created At timestamp
        data.push(record);
    }
    return data;
}

/**
 * Create a new item
 */
function createItem(data) {
    const sheet = getSheet();
    const id = Utilities.getUuid();
    const now = new Date();

    const row = [
        id,
        data.date || '',
        data.name1 || '',
        data.name2 || '',
        data.name3 || '',
        data.total || 0,
        data.set || '',
        data.mine_ice || '',
        now,
        now
    ];

    sheet.appendRow(row);

    return {
        status: 'success',
        message: 'Item created',
        createdId: id
    };
}

/**
 * Update an existing item
 */
function updateItem(id, data) {
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();

    // Find row by ID (index 0)
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
            rowIndex = i + 1; // 1-based index for getRange
            break;
        }
    }

    if (rowIndex === -1) {
        throw new Error('Item not found');
    }

    const now = new Date();

    if (data.date !== undefined) sheet.getRange(rowIndex, 2).setValue(data.date);
    if (data.name1 !== undefined) sheet.getRange(rowIndex, 3).setValue(data.name1);
    if (data.name2 !== undefined) sheet.getRange(rowIndex, 4).setValue(data.name2);
    if (data.name3 !== undefined) sheet.getRange(rowIndex, 5).setValue(data.name3);
    if (data.total !== undefined) sheet.getRange(rowIndex, 6).setValue(data.total);
    if (data.set !== undefined) sheet.getRange(rowIndex, 7).setValue(data.set);
    if (data.mine_ice !== undefined) sheet.getRange(rowIndex, 8).setValue(data.mine_ice);

    sheet.getRange(rowIndex, 10).setValue(now);

    return {
        status: 'success',
        message: 'Item updated'
    };
}

/**
 * Delete an item
 */
function deleteItem(id) {
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
            rowIndex = i + 1;
            break;
        }
    }

    if (rowIndex === -1) {
        throw new Error('Item not found');
    }

    sheet.deleteRow(rowIndex);

    return {
        status: 'success',
        message: 'Item deleted'
    };
}

/**
 * Manage Casts (Settings Sheet)
 */
function manageCast(subAction, name) {
    if (!name) throw new Error('Cast name is required');

    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) throw new Error('Settings sheet not found');

    if (subAction === 'add') {
        const lastRow = sheet.getLastRow();
        // Add to Column B (2)
        sheet.getRange(lastRow + 1, 2).setValue(name);
        return { status: 'success', message: 'Cast added' };

    } else if (subAction === 'delete') {
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return { status: 'error', message: 'No casts to delete' };

        const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        let rowIndex = -1;

        // Find match in Column B
        for (let i = 0; i < values.length; i++) {
            if (values[i][0] === name) {
                rowIndex = i + 2; // +2 for header and 0-basing
                break;
            }
        }

        if (rowIndex !== -1) {
            sheet.deleteRow(rowIndex);
            return { status: 'success', message: 'Cast deleted' };
        } else {
            return { status: 'error', message: 'Cast not found' };
        }
    }

    throw new Error('Invalid sub_action');
}

/**
 * Helper to standard response
 */
function handleResponse(func) {
    try {
        const result = func();
        return ContentService
            .createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: e.toString()
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Get the sheet
 */
function getSheet() {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = doc.getSheetByName(SHEET_NAME);
    if (!sheet) {
        throw new Error(`Sheet "${SHEET_NAME}" not found. Run setup() first.`);
    }
    return sheet;
}
