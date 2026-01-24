/**
 * OCR functionality using Gemini API
 */

const GEMINI_API_KEY = 'AIzaSyDgh6mXV_NtWkAwSx8uoUK2eaFHzHl8Fgg';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Camera elements
let cameraStream = null;
const cameraModal = document.getElementById('camera-modal');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const previewContainer = document.getElementById('preview-container');
const previewImage = document.getElementById('preview-image');
const cameraBtn = document.getElementById('camera-btn');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const closeCameraBtn = document.getElementById('close-camera');
const captureBtn = document.getElementById('capture-btn');
const retakeBtn = document.getElementById('retake-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const ocrLoading = document.getElementById('ocr-loading');

let capturedImageData = null;

// Initialize camera and upload functionality
function initCamera() {
    if (!cameraBtn) return;

    cameraBtn.addEventListener('click', openCamera);
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    closeCameraBtn.addEventListener('click', closeCamera);
    captureBtn.addEventListener('click', captureImage);
    retakeBtn.addEventListener('click', retakePhoto);
    analyzeBtn.addEventListener('click', analyzeImage);
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
        showToast('画像ファイルを選択してください', 'error');
        return;
    }
    
    // Read file as data URL
    const reader = new FileReader();
    reader.onload = (e) => {
        capturedImageData = e.target.result;
        
        // Open modal with preview
        cameraModal.classList.remove('hidden');
        previewImage.src = capturedImageData;
        cameraVideo.style.display = 'none';
        previewContainer.classList.remove('hidden');
        
        // Update buttons
        captureBtn.style.display = 'none';
        retakeBtn.style.display = 'flex';
        analyzeBtn.style.display = 'flex';
    };
    
    reader.readAsDataURL(file);
    
    // Reset file input
    event.target.value = '';
}

// Open camera modal and start video stream
async function openCamera() {
    try {
        cameraModal.classList.remove('hidden');
        
        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // Use back camera on mobile
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        
        cameraVideo.srcObject = cameraStream;
        cameraVideo.style.display = 'block';
        previewContainer.classList.add('hidden');
        captureBtn.style.display = 'flex';
        retakeBtn.style.display = 'none';
        analyzeBtn.style.display = 'none';
        
    } catch (error) {
        console.error('Camera access error:', error);
        showToast('カメラへのアクセスに失敗しました', 'error');
        closeCamera();
    }
}

// Close camera modal and stop video stream
function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    cameraModal.classList.add('hidden');
    cameraVideo.srcObject = null;
    cameraVideo.style.display = 'block';
    previewContainer.classList.add('hidden');
    capturedImageData = null;
}

// Capture image from video stream
function captureImage() {
    const canvas = cameraCanvas;
    const video = cameraVideo;
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
    
    // Show preview
    previewImage.src = capturedImageData;
    cameraVideo.style.display = 'none';
    previewContainer.classList.remove('hidden');
    
    // Update buttons
    captureBtn.style.display = 'none';
    retakeBtn.style.display = 'flex';
    analyzeBtn.style.display = 'flex';
    
    // Stop camera stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// Retake photo
async function retakePhoto() {
    capturedImageData = null;
    previewContainer.classList.add('hidden');
    retakeBtn.style.display = 'none';
    analyzeBtn.style.display = 'none';
    
    // Restart camera
    await openCamera();
}

// Analyze image with Gemini API
async function analyzeImage() {
    if (!capturedImageData) {
        showToast('画像が見つかりません', 'error');
        return;
    }
    
    // Prevent multiple clicks
    if (analyzeBtn.disabled) {
        return;
    }
    
    // Show loading and disable buttons
    ocrLoading.classList.remove('hidden');
    analyzeBtn.disabled = true;
    retakeBtn.disabled = true;
    captureBtn.disabled = true;
    
    // Update button text to show processing
    const originalAnalyzeText = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div><span>解析中...</span>';
    analyzeBtn.style.opacity = '0.6';
    analyzeBtn.style.cursor = 'not-allowed';
    
    try {
        // Convert base64 to proper format for Gemini
        const base64Image = capturedImageData.split(',')[1];
        
        // Prepare request
        const requestBody = {
            contents: [{
                parts: [
                    {
                        text: `この画像は飲食店の伝票です。以下のレイアウトで情報を抽出してJSON形式で返してください：

【伝票のレイアウト】
- 日付: 右上に記載（例: 令和8年1月20日）→ YYYY-MM-DD形式に変換
- キャスト名: 左上に記載（例: ママ、まま、MAMA など）※カタカナ、ひらがな、漢字、アルファベットの可能性あり
- セット: 品名の一つ下の行に記載（数字が含まれている場合はその数字を抽出）金額: 一番右の列に記載
- ミネアイスの合計: 一番右の列に記載
- 合計金額: 一番右の列の最下部に記載

【抽出する情報】
- date: 日付（YYYY-MM-DD形式）※令和を西暦に変換（令和8年=2026年）
- names: キャスト名の配列（左上から最大3名、必ず抽出してください）
- total: 合計金額（一番右の列の最下部、数値のみ）
- set: セット情報の数字部分（例: "セット3000"なら3000、"ランチセット2500"なら2500、数字のみ抽出）
- mine_ice: ミネアイスの合計金額（一番右の列、数値のみ、あれば）

【重要な注意事項】
1. キャスト名は必ず抽出してください。左上に記載されている名前を見逃さないでください
2. キャスト名は様々な表記（カタカナ、ひらがな、漢字、アルファベット）の可能性があります
3. セットの情報に数字が含まれている場合は、その数字のみを抽出してください
4. 金額は数字のみを抽出してください（カンマや円マークは除く）
5. 日付が見つからない場合は今日の日付を使用
6. JSONのみを返し、他の説明は不要です

【出力例】
{
  "date": "2026-01-20",
  "names": ["ママ"],
  "total": 15000,
  "set": 3000,
  "mine_ice": 2000
}`
                    },
                    {
                        inline_data: {
                            mime_type: 'image/jpeg',
                            data: base64Image
                        }
                    }
                ]
            }]
        };
        
        // Call Gemini API
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('APIのリクエスト制限に達しました。1分ほど待ってから再度お試しください');
            }
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract text from response
        const text = data.candidates[0].content.parts[0].text;
        console.log('Gemini response:', text);
        
        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSONが見つかりませんでした');
        }
        
        const ocrResult = JSON.parse(jsonMatch[0]);
        
        // Fill form with OCR results
        fillFormWithOCR(ocrResult);
        
        // Close modal
        closeCamera();
        showToast('伝票を解析しました', 'success');
        
    } catch (error) {
        console.error('OCR error:', error);
        showToast('解析に失敗しました: ' + error.message, 'error');
    } finally {
        // Restore button states
        ocrLoading.classList.add('hidden');
        analyzeBtn.disabled = false;
        retakeBtn.disabled = false;
        captureBtn.disabled = false;
        
        // Restore button appearance
        analyzeBtn.innerHTML = '<i class="ph ph-sparkle"></i><span>解析する</span>';
        analyzeBtn.style.opacity = '1';
        analyzeBtn.style.cursor = 'pointer';
    }
}

// Fill form with OCR results
function fillFormWithOCR(ocrResult) {
    console.log('OCR Result:', ocrResult);
    
    // Fill date
    if (ocrResult.date) {
        document.getElementById('date').value = ocrResult.date;
    }
    
    // Fill cast names
    if (ocrResult.names && Array.isArray(ocrResult.names)) {
        const nameFields = ['name1', 'name2', 'name3'];
        ocrResult.names.forEach((name, index) => {
            if (index < 3 && name) {
                const select = document.getElementById(nameFields[index]);
                // Try to find matching option
                const options = Array.from(select.options);
                const matchingOption = options.find(opt => 
                    opt.value.toLowerCase().includes(name.toLowerCase()) ||
                    name.toLowerCase().includes(opt.value.toLowerCase())
                );
                
                if (matchingOption) {
                    select.value = matchingOption.value;
                }
            }
        });
    }
    
    // Fill total amount
    if (ocrResult.total) {
        const totalValue = typeof ocrResult.total === 'string' 
            ? parseInt(ocrResult.total.replace(/[^\d]/g, ''))
            : ocrResult.total;
        document.getElementById('total').value = totalValue;
    }
    
    // Fill set info
    if (ocrResult.set) {
        document.getElementById('set-info').value = ocrResult.set;
    }
    
    // Fill mine/ice info
    if (ocrResult.mine_ice) {
        document.getElementById('mine-ice').value = ocrResult.mine_ice;
    }
    
    // Scroll to form
    document.getElementById('slip-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
});
