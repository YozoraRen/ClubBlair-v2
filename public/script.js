/**
 * Logic for Slip Entry App
 */

// State
let entries = [];
let casts = [];
let timecardLogs = []; // Added
let isEditing = false;
let currentEditId = null;

// DOM Elements
const form = document.getElementById('slip-form');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const dataListEl = document.getElementById('data-list');
// const settingsModal = document.getElementById('settings-modal'); // Deprecated
// const settingsModal = document.getElementById('settings-modal'); // Deprecated
// const gasUrlInput = document.getElementById('gas-url'); // Removed from UI
const toastContainer = document.getElementById('toast-container');

// Settings management
let gasUrl = localStorage.getItem('club_blair_gas_url') || 'https://script.google.com/macros/s/AKfycbyAQjv6o749gS_PmBsUsxPv5Nun4KgC86GSteL4VLonSMBrFM-x_rgKK9JGtPSsI53y0w/exec';

// TimeCard Logic
class TimeCardManager {
    constructor() {
        this.video = document.getElementById('timecard-video');
        this.castSelect = document.getElementById('timecard-cast');
        this.btnIn = document.getElementById('btn-clock-in');
        this.btnOut = document.getElementById('btn-clock-out');
        this.checkboxGuest = document.getElementById('with-guest');
        this.stream = null;
        this.timeInterval = null;
        this.castStatuses = {}; // { "Name": "clock_in" | "clock_out" }

        this.setupListeners();
        this.startTimeUpdate();
        
        // Initial render to clear "Loading..." state immediately
        this.renderActiveCastList();
    }

    setStatuses(statuses) {
        this.castStatuses = statuses || {};
        // If a cast is already selected, update buttons immediately
        this.updateButtons();
        // Update list view
        this.renderActiveCastList();
    }

    renderActiveCastList() {
        const listEl = document.getElementById('active-cast-list');
        const countEl = document.getElementById('active-cast-count');
        
        if (!listEl || !countEl) {
            console.warn('Active cast list elements not found');
            return;
        }
        
        // Filter active casts
        const activeCasts = Object.entries(this.castStatuses)
            .filter(([_, status]) => status === 'clock_in')
            .map(([name, _]) => name);
            
        countEl.textContent = `${activeCasts.length}名`;
        
        if (activeCasts.length === 0) {
            listEl.innerHTML = '<div class="empty-state-mini">現在出勤中のキャストはいません</div>';
            return;
        }
        
        listEl.innerHTML = '';
        activeCasts.forEach(name => {
            const chip = document.createElement('div');
            chip.className = 'active-cast-chip';
            chip.innerHTML = `
                <span class="status-dot"></span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
            `;
            listEl.appendChild(chip);
        });
    }

    setupListeners() {
        // Cast selection enables/disables buttons based on status
        this.castSelect.addEventListener('change', () => {
            this.updateButtons();
        });

        // Button Actions
        this.btnIn.addEventListener('click', () => this.handleClockInOut('clock_in'));
        this.btnOut.addEventListener('click', () => this.handleClockInOut('clock_out'));
    }

    updateButtons() {
        const name = this.castSelect.value;
        if (!name) {
            this.btnIn.disabled = true;
            this.btnOut.disabled = true;
            this.btnIn.style.opacity = '0.5';
            this.btnOut.style.opacity = '0.5';
            return;
        }

        const status = this.castStatuses[name];
        
        // Logic:
        // If status is 'clock_in' (already working) -> In: Disabled, Out: Enabled
        // If status is 'clock_out' or undefined (not working) -> In: Enabled, Out: Disabled
        
        if (status === 'clock_in') {
            // Already Clocked In
            this.btnIn.disabled = true;
            this.btnIn.style.opacity = '0.5';
            
            this.btnOut.disabled = false;
            this.btnOut.style.opacity = '1';
        } else {
            // Clocked Out or No Record
            this.btnIn.disabled = false;
            this.btnIn.style.opacity = '1';
            
            this.btnOut.disabled = true; // Cannot clock out if not clocked in
            this.btnOut.style.opacity = '0.5';
        }
    }

    async startCamera() {
        if (this.stream) return;

        try {
            const constraints = {
                video: {
                    facingMode: 'user', // Front camera
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
        } catch (err) {
            console.error('Camera Error:', err);
            showToast('カメラの起動に失敗しました', 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
        }
    }

    startTimeUpdate() {
        const display = document.getElementById('current-time-display');
        const update = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            if(display) display.textContent = `${hours}:${minutes}`;
        };
        update(); // Initial
        this.timeInterval = setInterval(update, 1000);
    }

    async handleClockInOut(type) {
        if (!gasUrl) {
            showToast('GASのURLが設定されていません', 'error');
            return;
        }

        const name = this.castSelect.value;
        if (!name) return;

        const withGuest = this.checkboxGuest.checked;
        const typeLabel = type === 'clock_in' ? '出勤' : '退勤';

        // Disable buttons
        this.btnIn.disabled = true;
        this.btnOut.disabled = true;

        showToast(`${typeLabel}処理中...`, 'default');

        try {
            const payload = {
                name: name,
                type: type,
                withGuest: withGuest,
                action: 'timecard' // Tag for GAS to differentiate if needed
            };
            
            // Note: If reusing same GAS endpoint, ensure it handles this payload structure
            // Or use a separate "doPost" logic on GAS side.
            // Our provided GAS script handles {name, type, withGuest} at root level.
            
            const response = await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });

            const json = await response.json();

            if (json.status === 'success' || json.message === 'Recorded') {
                showToast(`${name}さん、${typeLabel}完了しました`, 'success');
                
                // Update local status
                this.castStatuses[name] = type;
                
                this.castSelect.value = '';
                this.checkboxGuest.checked = false;
                this.updateButtons(); // Reset buttons
                this.renderActiveCastList(); // Update list
                
                // Return to home after delay
                setTimeout(() => {
                    navigateTo('view-home');
                }, 1500);
            } else {
                throw new Error(json.message || 'Unknown error');
            }
        } catch (e) {
            console.error(e);
            showToast('送信に失敗しました', 'error');
            // Re-enable buttons
            this.btnIn.disabled = false;
            this.btnOut.disabled = false;
        }
    }
}

let timeCardManager = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set today's date
    document.getElementById('date').valueAsDate = new Date();

    // Init TimeCard Manager
    timeCardManager = new TimeCardManager();

    fetchData();

    setupEventListeners();
});

function setupEventListeners() {
    // Settings Save Button removed
    // GAS URL is now hardcoded

    // Form
    form.addEventListener('submit', HandleSubmit);
    cancelEditBtn.addEventListener('click', resetForm);

    // Cast Management
    const addCastBtn = document.getElementById('add-cast-btn');
    if (addCastBtn) {
        addCastBtn.addEventListener('click', handleAddCast);
    }

    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', fetchData);
    
    // Refresh TimeCard History
    const refreshTimeCardBtn = document.getElementById('refresh-timecard-btn');
    if (refreshTimeCardBtn) {
        refreshTimeCardBtn.addEventListener('click', fetchData);
    }

    // Filter
    const filterStart = document.getElementById('filter-start');
    const filterEnd = document.getElementById('filter-end');

    if (filterStart) filterStart.addEventListener('change', renderList);
    if (filterEnd) filterEnd.addEventListener('change', renderList);

    setupNavigation();
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    // Bottom Nav Click
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;
            const mode = item.dataset.mode;
            navigateTo(targetId, mode);
        });
    });
}

// Global navigation helper (exposed for HTML onclick)
window.navigateTo = function (targetId, mode = null) {
    // Update Views
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });

    // Hide settings modal overlay if it still exists in DOM (legacy cleanup)
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('active');

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.style.display = 'block';
        setTimeout(() => targetSection.classList.add('active'), 10);
    }

    // Special Init for Settings View
    if (targetId === 'view-settings') {
        // Load current settings
        renderSettingsCastList();
    }

    // Update Bottom Nav State
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        const navTarget = nav.dataset.target;
        const navMode = nav.dataset.mode;

        if (navTarget === targetId) {
            if (mode && navMode === mode) {
                nav.classList.add('active');
            } else if (!mode && !navMode) {
                nav.classList.add('active');
            }
        }
    });

    // Handle Data View Modes
    if (targetId === 'view-data') {
        const titleEl = document.getElementById('data-view-title');
        const listEl = document.getElementById('data-list');

        if (mode === 'sales') {
            titleEl.textContent = '売上確認';
            listEl.dataset.mode = 'sales';
        } else {
            titleEl.textContent = '伝票履歴確認';
            listEl.dataset.mode = 'history';
        }
        renderList();
    }

    // Handle TimeCard History View
    if (targetId === 'view-timecard-history') {
        renderTimeCardHistory();
    }

    // TimeCard View Camera Logic
    if (targetId === 'view-timecard') {
        if (timeCardManager) timeCardManager.startCamera();
    } else {
        if (timeCardManager) timeCardManager.stopCamera();
    }
};

// --- Cast Management Logic ---

function renderSettingsCastList() {
    const listContainer = document.getElementById('settings-cast-list');
    listContainer.innerHTML = '';

    if (casts.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">キャストが登録されていません</div>';
        return;
    }

    casts.forEach(cast => {
        const item = document.createElement('div');
        item.className = 'cast-list-item';

        item.innerHTML = `
            <span class="cast-name">${cast}</span>
            <button class="btn-icon delete" onclick="handleDeleteCast('${cast}')" style="background: #fee2e2; color: #ef4444; width: 36px; height: 36px;">
                <i class="ph ph-trash"></i>
            </button>
        `;
        listContainer.appendChild(item);
    });
}

async function handleAddCast() {
    const input = document.getElementById('new-cast-name');
    const name = input.value.trim();

    if (!name) {
        showToast('名前を入力してください', 'error');
        return;
    }

    const btn = document.getElementById('add-cast-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const payload = {
            action: 'manage_cast',
            sub_action: 'add',
            name: name
        };

        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });

        const json = await response.json();

        if (json.status === 'success') {
            showToast('キャストを追加しました', 'success');
            input.value = '';
            // Refresh Data to get new list
            await fetchData();
            renderSettingsCastList();
        } else {
            throw new Error(json.message);
        }
    } catch (e) {
        console.error(e);
        showToast('追加エラー: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleDeleteCast(name) {
    if (!confirm(`${name} を削除しますか？`)) return;

    try {
        const payload = {
            action: 'manage_cast',
            sub_action: 'delete',
            name: name
        };

        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });

        const json = await response.json();

        if (json.status === 'success') {
            showToast('削除しました', 'success');
            await fetchData(); // Refresh
            renderSettingsCastList();
        } else {
            throw new Error(json.message);
        }
    } catch (e) {
        console.error(e);
        showToast('削除エラー', 'error');
    }
}

// Expose
window.handleDeleteCast = handleDeleteCast;

// --- End Cast Management Logic ---


// API & Rendering Logic implementation
async function fetchData() {
    if (!gasUrl) return;

    renderLoading();

    try {
        // Cache busting: Add timestamp to URL to prevent caching of GET requests
        const fetchUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
        const response = await fetch(fetchUrl);
        const json = await response.json();

        if (json.status === 'success') {
            entries = json.data.reverse(); // Show newest first
            if (json.meta) {
                if (json.meta.casts) {
                    casts = json.meta.casts;
                    updateCastOptions();
                }
                // Update TimeCard Statuses
                if (timeCardManager) {
                    // データがない場合でも空オブジェクトを渡して画面を更新（読み込み中を消す）
                    const statuses = (json.meta && json.meta.cast_statuses) ? json.meta.cast_statuses : {};
                    timeCardManager.setStatuses(statuses);
                }
                // Store TimeCard Logs
                if (json.meta.timecard_logs) {
                    timecardLogs = json.meta.timecard_logs;
                }
            }

            // Debug feedback
            if (casts.length === 0) {
                showToast('キャスト一覧が空です。設定から追加するか、GASを確認してください。', 'default');
            }

            renderList();
            renderTodayEntries(); // Update today's entries
            renderTimeCardHistory(); // Update TimeCard History
        } else {
            throw new Error(json.message);
        }
    } catch (error) {
        console.error(error);
        renderError(`データの取得に失敗しました。<br>詳細: ${error.message}`);
        showToast('データ取得エラー', 'error');
    }
}

// Render today's entries in the input view
function renderTodayEntries() {
    const todaySection = document.getElementById('today-entries-section');
    const todayList = document.getElementById('today-entries-list');
    const todayCount = document.getElementById('today-count');
    
    if (!todaySection || !todayList) return;
    
    // Get today's date in YYYY-MM-DD format (local time)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Filter entries where the created_at (submission date) matches today
    const todayEntries = entries.filter(item => {
        if (!item.created_at) return false;
        try {
            const createdDate = new Date(item.created_at);
            const createdDateStr = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
            return createdDateStr === todayStr;
        } catch (e) {
            return false;
        }
    });
    
    // Show/hide section based on entries
    if (todayEntries.length === 0) {
        todaySection.style.display = 'none';
        return;
    }
    
    todaySection.style.display = 'block';
    todayCount.textContent = `${todayEntries.length}件`;
    
    // Clear list
    todayList.innerHTML = '';
    
    // Render entries
    todayEntries.forEach(item => {
        const card = document.createElement('div');
        card.className = 'data-card';
        
        const total = Number(item.total).toLocaleString();
        
        card.innerHTML = `
            <div class="card-header">
                <span class="date-badge" style="visibility: hidden;"></span>
                <div class="card-actions" style="margin-left: auto;">
                    <button class="btn-icon edit" data-id="${item.id}">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-icon delete" data-id="${item.id}">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body" style="margin-top: -30px;">
                <div>
                    <div class="info-label">キャスト</div>
                    <div class="info-value">
                        ${[item.name1, item.name2, item.name3].filter(n => n).join(', ') || '-'}
                    </div>
                </div>
                <div>
                    <div class="info-label">合計</div>
                    <div class="total-value">¥${total}</div>
                </div>
                <div>
                    <div class="info-label">セット</div>
                    <div class="info-value">${item.set || '-'}</div>
                </div>
                <div>
                    <div class="info-label">ミネ・アイス</div>
                    <div class="info-value">${item.mine_ice || '-'}</div>
                </div>
            </div>
        `;
        
        // Add event listeners
        const editBtn = card.querySelector('.btn-icon.edit');
        const deleteBtn = card.querySelector('.btn-icon.delete');
        
        editBtn.addEventListener('click', () => {
            window.startEdit(item.id);
        });
        
        deleteBtn.addEventListener('click', () => {
            handleDelete(item.id);
        });
        
        todayList.appendChild(card);
    });
}

async function HandleSubmit(e) {
    e.preventDefault();
    if (!gasUrl) {
        navigateTo('view-settings');
        showToast('GASのURLを設定してください', 'error');
        return;
    }

    setLoading(true);

    // Get cast values
    const name1 = document.getElementById('name1').value;
    const name2 = document.getElementById('name2').value;
    const name3 = document.getElementById('name3').value;
    
    // Count number of selected casts
    const castCount = [name1, name2, name3].filter(name => name && name.trim() !== '').length;
    
    // Get total amount and divide by cast count if applicable
    let totalAmount = document.getElementById('total').value;
    if (castCount >= 2 && totalAmount) {
        totalAmount = Math.round(parseFloat(totalAmount) / castCount);
    }
    
    // Get set and mine_ice values and divide if they are numeric
    let setInfo = document.getElementById('set-info').value;
    let mineIce = document.getElementById('mine-ice').value;
    
    if (castCount >= 2) {
        // Check if set is a number and divide
        if (setInfo && !isNaN(parseFloat(setInfo))) {
            setInfo = Math.round(parseFloat(setInfo) / castCount).toString();
        }
        
        // Check if mine_ice is a number and divide
        if (mineIce && !isNaN(parseFloat(mineIce))) {
            mineIce = Math.round(parseFloat(mineIce) / castCount).toString();
        }
    }

    const formData = {
        date: document.getElementById('date').value,
        name1: name1,
        name2: name2,
        name3: name3,
        total: totalAmount,
        set: setInfo,
        mine_ice: mineIce
    };

    const action = isEditing ? 'update' : 'create';
    const payload = {
        action: action,
        data: formData
    };

    if (isEditing) {
        payload.id = currentEditId;
    }

    try {
        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            }
        });

        const json = await response.json();

        if (json.status === 'success') {
            showToast(isEditing ? '更新しました' : '送信しました', 'success');
            resetForm();
            fetchData(); // Reload list
        } else {
            throw new Error(json.message);
        }
    } catch (error) {
        console.error(error);
        showToast('送信エラーが発生しました', 'error');
    } finally {
        setLoading(false);
    }
}

async function handleDelete(id) {
    if (!confirm('本当に削除しますか？')) return;

    if (!gasUrl) return;

    try {
        const payload = {
            action: 'delete',
            id: id
        };

        const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            }
        });

        const json = await response.json();

        if (json.status === 'success') {
            showToast('削除しました', 'success');
            fetchData();
        } else {
            throw new Error(json.message);
        }
    } catch (error) {
        console.error(error);
        showToast('削除エラー', 'error');
    }
}


// UI Helpers
function renderTimeCardHistory() {
    const listEl = document.getElementById('timecard-history-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!timecardLogs || timecardLogs.length === 0) {
        listEl.innerHTML = '<div class="empty-state">履歴がありません</div>';
        return;
    }

    // Group logs by date (YYYY/MM/DD)
    const grouped = {};
    const dateKeys = [];

    timecardLogs.forEach(log => {
        let dateStr = '不明な日付';
        try {
            // log.date format depends on GAS: 'yyyy/MM/dd HH:mm:ss'
            const parts = log.date.split(' ');
            if (parts.length > 0) {
                dateStr = parts[0];
            }
        } catch (e) {}

        if (!grouped[dateStr]) {
            grouped[dateStr] = [];
            dateKeys.push(dateStr);
        }
        grouped[dateStr].push(log);
    });

    dateKeys.forEach(date => {
        const logsInDate = grouped[date];
        
        // Header
        const header = document.createElement('div');
        header.className = 'date-group-header';
        header.innerHTML = `<span>${date}</span>`;
        listEl.appendChild(header);

        // Group by cast name
        const logsByCast = {};
        logsInDate.forEach(log => {
            if (!logsByCast[log.name]) logsByCast[log.name] = [];
            logsByCast[log.name].push(log);
        });

        // Pair logs
        const dailyRecords = [];
        Object.keys(logsByCast).forEach(castName => {
            const userLogs = logsByCast[castName];
            // Sort by time (ascending)
            userLogs.sort((a, b) => a.time.localeCompare(b.time));

            const pairs = [];
            let currentIn = null;

            userLogs.forEach(log => {
                if (log.type === 'clock_in') {
                    if (currentIn) {
                        // Previous clock_in not closed -> treat as clock_in only
                        pairs.push({
                            name: castName,
                            in_time: currentIn.time,
                            out_time: null,
                            with_guest: currentIn.with_guest
                        });
                    }
                    currentIn = log;
                } else if (log.type === 'clock_out') {
                    if (currentIn) {
                        // Pair matched
                        pairs.push({
                            name: castName,
                            in_time: currentIn.time,
                            out_time: log.time,
                            with_guest: currentIn.with_guest // Use clock_in guest info
                        });
                        currentIn = null;
                    } else {
                        // Clock_out only
                        pairs.push({
                            name: castName,
                            in_time: null,
                            out_time: log.time,
                            with_guest: log.with_guest
                        });
                    }
                }
            });

            if (currentIn) {
                // Pending clock_out
                pairs.push({
                    name: castName,
                    in_time: currentIn.time,
                    out_time: null,
                    with_guest: currentIn.with_guest
                });
            }
            
            dailyRecords.push(...pairs);
        });

        // Sort records by time
        dailyRecords.sort((a, b) => {
            const timeA = a.in_time || a.out_time;
            const timeB = b.in_time || b.out_time;
            return timeA.localeCompare(timeB);
        });

        // Render records
        dailyRecords.forEach(record => {
            const card = document.createElement('div');
            card.className = 'cast-list-item';
            card.style.background = '#1a1d26';
            card.style.border = '1px solid #3a3f4b';
            card.style.borderRadius = '8px';
            card.style.marginBottom = '8px';
            card.style.padding = '12px';

            let guestBadge = '';
            if (record.with_guest === 'あり' || record.with_guest === true) {
                guestBadge = `<span style="background: rgba(240, 185, 11, 0.15); color: #ffc107; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">同伴</span>`;
            }

            let timeDisplay = '';
            if (record.in_time && record.out_time) {
                timeDisplay = `<span style="color: #40c057;">${record.in_time}</span> - <span style="color: #5c7cfa;">${record.out_time}</span>`;
            } else if (record.in_time) {
                timeDisplay = `<span style="color: #40c057;">${record.in_time}</span> - <span style="color: #a0a0a0;">(退勤未完了)</span>`;
            } else if (record.out_time) {
                timeDisplay = `<span style="color: #a0a0a0;">(出勤不明)</span> - <span style="color: #5c7cfa;">${record.out_time}</span>`;
            }

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                    <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; color: var(--text-light); border: 1px solid #3a3f4b;">
                        <i class="ph ph-clock" style="font-size: 20px;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center;">
                            <span style="font-weight: 600; font-size: 0.95rem;">${record.name}</span>
                            ${guestBadge}
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-color); margin-top: 4px; font-family: monospace;">
                            ${timeDisplay}
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(card);
        });
    });
}

function renderList() {
    dataListEl.innerHTML = '';

    const mode = dataListEl.dataset.mode || 'history';

    // Filter logic
    let displayEntries = entries;
    const startDateVal = document.getElementById('filter-start').value;
    const endDateVal = document.getElementById('filter-end').value;

    if (startDateVal || endDateVal) {
        displayEntries = entries.filter(item => {
            if (!item.date) return false;
            try {
                const itemDate = new Date(item.date).toISOString().split('T')[0];

                let matchesStart = true;
                let matchesEnd = true;

                if (startDateVal) {
                    matchesStart = itemDate >= startDateVal;
                }

                if (endDateVal) {
                    matchesEnd = itemDate <= endDateVal;
                }

                return matchesStart && matchesEnd;
            } catch (e) { return false; }
        });
    }

    if (displayEntries.length === 0) {
        dataListEl.innerHTML = '<div class="empty-state">データがありません</div>';
        document.getElementById('filtered-total-container').classList.add('hidden');
        return;
    }

    // Calculate Total for Filtered Range
    const totalSum = displayEntries.reduce((sum, item) => {
        const val = parseInt(item.total, 10);
        return sum + (isNaN(val) ? 0 : val);
    }, 0);

    // Update UI
    const totalContainer = document.getElementById('filtered-total-container');
    const totalValue = document.getElementById('filtered-total-amount');

    totalContainer.classList.remove('hidden');
    totalValue.textContent = '¥' + totalSum.toLocaleString();

    // Grouping by Date
    const grouped = {};
    const dateKeys = [];

    displayEntries.forEach(item => {
        let dStr = '不明な日付';
        try {
            const d = new Date(item.date);
            if (!isNaN(d.getTime())) {
                dStr = d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
            }
        } catch (e) { }

        if (!grouped[dStr]) {
            grouped[dStr] = { items: [], total: 0 };
            dateKeys.push(dStr);
        }
        grouped[dStr].items.push(item);

        // Calculate daily total
        const val = parseInt(item.total, 10);
        if (!isNaN(val)) grouped[dStr].total += val;
    });

    dateKeys.forEach(dStr => {
        const group = grouped[dStr];

        if (mode === 'sales') {
            // SALES MODE
            const row = document.createElement('div');
            row.className = 'data-card';
            row.style.flexDirection = 'row';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '16px';

            row.innerHTML = `
                <div style="font-weight: bold; color: var(--text-light);">${dStr}</div>
                <div style="display: flex; gap: 16px; align-items: center;">
                    <div style="font-size: 0.9rem; color: var(--text-light);">${group.items.length}件</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-color);">¥${group.total.toLocaleString()}</div>
                </div>
            `;
            dataListEl.appendChild(row);

        } else {
            // HISTORY MODE
            // Render Header
            const header = document.createElement('div');
            header.className = 'date-group-header';
            header.innerHTML = `
                <span>${dStr}</span>
                <span class="daily-total">¥${group.total.toLocaleString()}</span>
            `;
            dataListEl.appendChild(header);

            // Render Items
            group.items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'data-card';

                // Format Money
                const total = Number(item.total).toLocaleString();

                card.innerHTML = `
                    <div class="card-header">
                        <span class="date-badge" style="visibility: hidden;"></span>
                        <div class="card-actions" style="margin-left: auto;">
                            <button class="btn-icon edit" data-id="${item.id}">
                                <i class="ph ph-pencil-simple"></i>
                            </button>
                            <button class="btn-icon delete" data-id="${item.id}">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="margin-top: -30px;">
                        <div>
                            <div class="info-label">キャスト</div>
                            <div class="info-value">
                                ${[item.name1, item.name2, item.name3].filter(n => n).join(', ') || '-'}
                            </div>
                        </div>
                        <div>
                            <div class="info-label">合計</div>
                            <div class="total-value">¥${total}</div>
                        </div>
                        <div>
                            <div class="info-label">セット</div>
                            <div class="info-value">${item.set || '-'}</div>
                        </div>
                        <div>
                            <div class="info-label">ミネ・アイス</div>
                            <div class="info-value">${item.mine_ice || '-'}</div>
                        </div>
                    </div>
                `;
                
                // Add event listeners
                const editBtn = card.querySelector('.btn-icon.edit');
                const deleteBtn = card.querySelector('.btn-icon.delete');
                
                editBtn.addEventListener('click', () => {
                    window.startEdit(item.id);
                });
                
                deleteBtn.addEventListener('click', () => {
                    handleDelete(item.id);
                });
                
                dataListEl.appendChild(card);
            });
        }
    });

}

function updateCastOptions() {
    const selects = document.querySelectorAll('.cast-select');
    selects.forEach(select => {
        const currentVal = select.value;

        select.innerHTML = '<option value="">選択してください</option>';
        casts.forEach(cast => {
            const option = document.createElement('option');
            option.value = cast;
            option.textContent = cast;
            select.appendChild(option);
        });

        if (casts.includes(currentVal)) {
            select.value = currentVal;
        }
    });

}

function renderLoading() {
    dataListEl.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="border-top-color: var(--primary-color); border: 2px solid #eee; width: 30px; height: 30px; margin: 0 auto;"></div><br>読み込み中...</div>';
}

function renderError(msg) {
    dataListEl.innerHTML = `<div class="empty-state" style="color: var(--danger-color);">${msg}</div>`;
}

// Expose to window for onclick handlers
window.handleDelete = handleDelete;
window.startEdit = function (id) {
    navigateTo('view-input'); // Switch to input view

    const item = entries.find(e => e.id === id);
    if (!item) {
        console.error('Item not found:', id);
        return;
    }

    isEditing = true;
    currentEditId = id;

    // Populate form - date handling
    if (item.date) {
        try {
            const d = new Date(item.date);
            if (!isNaN(d.getTime())) {
                // Convert to YYYY-MM-DD format for input[type="date"]
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                document.getElementById('date').value = `${year}-${month}-${day}`;
            }
        } catch (e) {
            console.error('Date parsing error:', e);
        }
    }

    document.getElementById('name1').value = item.name1 || '';
    document.getElementById('name2').value = item.name2 || '';
    document.getElementById('name3').value = item.name3 || '';
    document.getElementById('total').value = item.total || '';
    document.getElementById('set-info').value = item.set || '';
    document.getElementById('mine-ice').value = item.mine_ice || '';

    // UI Update
    submitBtn.innerHTML = '<span class="btn-text">更新する</span><i class="ph ph-check" style="font-size: 18px;"></i>';
    cancelEditBtn.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetForm() {
    form.reset();
    document.getElementById('date').valueAsDate = new Date();
    isEditing = false;
    currentEditId = null;
    submitBtn.innerHTML = '<span class="btn-text">送信する</span><i class="ph ph-paper-plane-right" style="font-size: 18px;"></i>';
    cancelEditBtn.classList.add('hidden');
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        const originalText = isEditing ? '更新中...' : '送信中...';
        submitBtn.innerHTML = `<div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div><span class="btn-text">${originalText}</span>`;
        submitBtn.style.opacity = '0.8';
        submitBtn.style.cursor = 'not-allowed';
    } else {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        const text = isEditing ? '更新する' : '送信する';
        const icon = isEditing ? 'check' : 'paper-plane-right';
        submitBtn.innerHTML = `<span class="btn-text">${text}</span><i class="ph ph-${icon}" style="font-size: 18px;"></i>`;
    }
}

function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') icon = '<i class="ph ph-check-circle" style="color: var(--success-color); font-size: 20px;"></i>';
    if (type === 'error') icon = '<i class="ph ph-warning-circle" style="color: var(--danger-color); font-size: 20px;"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
