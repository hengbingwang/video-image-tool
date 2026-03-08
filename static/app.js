// =====================================================
// State
// =====================================================
const state = {
  video: {
    id: null,
    filename: null,
    screenshots: [],   // [{id, filename, timestamp, url}]
    selectedId: null,
  },
  stitch: {
    id: null,
    images: [],        // [{id, filename, url}]
    dragSrcIdx: null,
  },
  report: {
    id: null,
    images: [],        // [{id, filename, url}]
    dragSrcIdx: null,
    scene: 'overview',
    prompt: '',
    content: '',
    loading: false,
  },
};

// =====================================================
// Utilities
// =====================================================
function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
}

function setStatus(id, msg, loading = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = (loading ? '<span class="spinner"></span>' : '') + msg;
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res;
}

// =====================================================
// Tab switching
// =====================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// =====================================================
// VIDEO TAB
// =====================================================
const videoEl = document.getElementById('videoPlayer');
const shotList = document.getElementById('shotList');
const shotCount = document.getElementById('shotCount');

// --- Upload video ---
function setupVideoUpload() {
  const zone = document.getElementById('videoUploadZone');
  const input = document.getElementById('videoFileInput');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) handleVideoFile(input.files[0]); });
}

async function handleVideoFile(file) {
  setStatus('videoStatus', `上传中: ${file.name}...`, true);
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await apiFetch('/api/upload-video', { method: 'POST', body: fd });
    const data = await res.json();
    state.video.id = data.video_id;
    state.video.filename = data.filename;
    state.video.screenshots = [];

    videoEl.src = `/api/video-file/${data.video_id}`;
    videoEl.load();
    document.getElementById('videoSection').classList.remove('hidden');
    document.getElementById('videoUploadZone').classList.add('hidden');
    renderShotList();
    setStatus('videoStatus', `已加载: ${file.name}`);
  } catch (e) {
    setStatus('videoStatus', `上传失败: ${e.message}`);
  }
}

// --- Detect scenes ---
document.getElementById('detectBtn').addEventListener('click', async () => {
  if (!state.video.id) return;
  const detector = document.getElementById('detectorSelect').value;
  const threshold = parseFloat(document.getElementById('thresholdInput').value) || 27;
  const minLen = parseFloat(document.getElementById('minLenInput').value) || 1;

  setStatus('videoStatus', '检测中...', true);
  document.getElementById('detectBtn').disabled = true;

  try {
    const params = new URLSearchParams({ video_id: state.video.id, detector, threshold, min_scene_len: minLen });
    const res = await apiFetch(`/api/detect-scenes?${params}`, { method: 'POST' });
    const data = await res.json();
    state.video.screenshots = data.screenshots;
    renderShotList();
    setStatus('videoStatus', `检测完成，共 ${data.screenshots.length} 个场景`);
  } catch (e) {
    setStatus('videoStatus', `检测失败: ${e.message}`);
  } finally {
    document.getElementById('detectBtn').disabled = false;
  }
});

// --- Capture current frame ---
document.getElementById('captureBtn').addEventListener('click', async () => {
  if (!state.video.id || !videoEl.src) return;
  const ts = videoEl.currentTime;
  setStatus('videoStatus', `截取 ${fmt(ts)}...`, true);

  try {
    const params = new URLSearchParams({ video_id: state.video.id, timestamp: ts });
    const res = await apiFetch(`/api/capture-frame?${params}`, { method: 'POST' });
    const data = await res.json();
    // Insert in order
    state.video.screenshots.push(data.screenshot);
    state.video.screenshots.sort((a, b) => a.timestamp - b.timestamp);
    renderShotList();
    setStatus('videoStatus', `已截取帧: ${fmt(ts)}`);
  } catch (e) {
    setStatus('videoStatus', `截取失败: ${e.message}`);
  }
});

// --- Delete screenshot ---
async function deleteShot(id) {
  try {
    await apiFetch(`/api/screenshot/${state.video.id}/${id}`, { method: 'DELETE' });
    state.video.screenshots = state.video.screenshots.filter(s => s.id !== id);
    renderShotList();
  } catch (e) {
    setStatus('videoStatus', `删除失败: ${e.message}`);
  }
}

// --- Render shot list ---
function renderShotList() {
  shotList.innerHTML = '';
  shotCount.textContent = state.video.screenshots.length;

  state.video.screenshots.forEach((shot, i) => {
    const item = document.createElement('div');
    item.dataset.id = shot.id;

    const card = document.createElement('div');
    card.className = 'shot-card' + (state.video.selectedId === shot.id ? ' selected' : '');

    card.innerHTML = `
      <img class="shot-thumb" src="${shot.url}" alt="" loading="lazy" title="点击跳转到 ${fmt(shot.timestamp)}">
      <div class="shot-card-footer">
        <span class="shot-ts">${fmt(shot.timestamp)}</span>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteShot('${shot.id}')">✕</button>
      </div>
    `;

    card.addEventListener('click', () => {
      videoEl.currentTime = shot.timestamp;
      videoEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    item.appendChild(card);
    shotList.appendChild(item);
  });
}

// --- Export screenshots ---
document.getElementById('exportShotsBtn').addEventListener('click', async () => {
  if (!state.video.id || !state.video.screenshots.length) return;
  const fmt_val = document.getElementById('exportFmtSelect').value;
  window.location.href = `/api/export-screenshots/${state.video.id}?fmt=${fmt_val}`;
});

// --- Execute action (stitch / report / both) ---
document.getElementById('executeActionBtn').addEventListener('click', async () => {
  if (!state.video.id || !state.video.screenshots.length) {
    alert('没有截图可发送');
    return;
  }
  const doStitch = document.getElementById('doStitchCheck').checked;
  const doReport = document.getElementById('doReportCheck').checked;
  if (!doStitch && !doReport) {
    alert('请至少选择一个操作（图片拼接 或 生成报告）');
    return;
  }

  if (doStitch) {
    setStatus('videoStatus', '发送到拼接...', true);
    try {
      const res = await apiFetch('/api/receive-screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: state.video.id,
          filenames: state.video.screenshots.map(s => s.filename),
        }),
      });
      const data = await res.json();
      state.stitch.id = data.stitch_id;
      state.stitch.images = data.images;
      renderImgGrid();
      updateRecommendedLayout();
      setStatus('stitchStatus', `已接收 ${data.images.length} 张截图`);
      setStatus('videoStatus', `已发送 ${data.images.length} 张截图到拼接工具`);
      if (!doReport) {
        switchTab('stitchTab');
      }
    } catch (e) {
      setStatus('videoStatus', `发送失败: ${e.message}`);
      return;
    }
  }

  if (doReport) {
    // 每次从视频截图执行时强制重置 report session，避免旧图片堆积
    state.report.id = null;
    state.report.images = [];
    setStatus('videoStatus', '发送截图到调研报告...', true);
    try {
      const res = await apiFetch('/api/receive-report-screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: null,
          video_id: state.video.id,
          filenames: state.video.screenshots.map(s => s.filename),
        }),
      });
      const data = await res.json();
      state.report.id = data.report_id;
      state.report.images = data.images;
      renderReportImgGrid();
      const stitchHint = doStitch ? '（图片拼接也已完成，可切换至拼接标签查看）' : '';
      setStatus('reportStatus', `已加载 ${state.report.images.length} 张图片${stitchHint}，请选择场景并生成报告`);
      setStatus('videoStatus', `已发送 ${data.images.length} 张截图到调研报告`);
      switchTab('reportTab');
    } catch (e) {
      setStatus('videoStatus', `发送到报告失败: ${e.message}`);
    }
  }
});

setupVideoUpload();

// Sync threshold slider when algorithm changes
const detectorConfig = {
  content:   { min: 1,  max: 100, step: 0.5, default: 27 },
  adaptive:  { min: 1,  max: 10,  step: 0.5, default: 3  },
  threshold: { min: 1,  max: 255, step: 1,   default: 12 },
};

function updateThresholdBubble() {
  const slider = document.getElementById('thresholdInput');
  const bubble = document.getElementById('thresholdBubble');
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const pct = (val - min) / (max - min);
  const thumbW = 16;
  const trackW = slider.offsetWidth;
  bubble.style.left = (thumbW / 2 + pct * (trackW - thumbW)) + 'px';
  bubble.textContent = val % 1 === 0 ? val : parseFloat(val).toFixed(1);
}

function applyDetectorConfig(key) {
  const cfg = detectorConfig[key];
  const slider = document.getElementById('thresholdInput');
  slider.min   = cfg.min;
  slider.max   = cfg.max;
  slider.step  = cfg.step;
  slider.value = cfg.default;
  updateThresholdBubble();
}

document.getElementById('detectorSelect').addEventListener('change', function() {
  applyDetectorConfig(this.value);
});

document.getElementById('thresholdInput').addEventListener('input', function() {
  updateThresholdBubble();
});

setTimeout(() => updateThresholdBubble(), 0);

// =====================================================
// STITCH TAB
// =====================================================

// --- Upload images ---
function setupStitchUpload() {
  const zone = document.getElementById('stitchUploadZone');
  const input = document.getElementById('stitchFileInput');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    if (e.dataTransfer.files.length) handleImgFiles(Array.from(e.dataTransfer.files));
  });
  input.addEventListener('change', () => {
    if (input.files.length) handleImgFiles(Array.from(input.files));
    input.value = '';
  });
}

async function handleImgFiles(files) {
  setStatus('stitchStatus', `上传 ${files.length} 张图片...`, true);
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  try {
    const res = await apiFetch('/api/upload-images', { method: 'POST', body: fd });
    const data = await res.json();

    if (state.stitch.id) {
      // Append
      state.stitch.images.push(...data.images);
    } else {
      state.stitch.id = data.stitch_id;
      state.stitch.images = data.images;
    }
    renderImgGrid();
    setStatus('stitchStatus', `已加载 ${state.stitch.images.length} 张图片`);
    updateRecommendedLayout();
  } catch (e) {
    setStatus('stitchStatus', `上传失败: ${e.message}`);
  }
}

async function updateRecommendedLayout() {
  const images = state.stitch.images;
  const n = images.length;
  if (n === 0) return;

  // Load natural dimensions for all images
  const dims = await Promise.all(images.map(img => new Promise(resolve => {
    const el = new Image();
    el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight });
    el.onerror = () => resolve({ w: 16, h: 9 });
    el.src = img.url;
  })));

  const avgAr = dims.reduce((sum, d) => sum + d.w / d.h, 0) / n;
  const TARGET_AR = 16 / 9;

  // Horizontal: fix cols → recommended cols to achieve ~16:9 overall
  const recCols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * TARGET_AR / avgAr))));
  // Vertical: fix rows → recommended rows
  const recRows = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * avgAr / TARGET_AR))));

  document.getElementById('colsInput').value = recCols;
  document.getElementById('rowsInput').value = recRows;

  const avgArStr = avgAr.toFixed(2);
  document.getElementById('layoutHint').textContent =
    `推荐 ${recCols} 列 / ${recRows} 行（${n} 张图，均宽高比 ${avgArStr}）`;
}

// --- Render image grid with drag & drop ---
function renderImgGrid() {
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = '';

  state.stitch.images.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.draggable = true;
    card.dataset.idx = idx;
    card.dataset.id = img.id;

    card.innerHTML = `
      <img src="${img.url}" alt="${img.filename}" loading="lazy">
      <div class="img-idx">${idx + 1}</div>
      <button class="img-del" title="删除" onclick="deleteStitchImg('${img.id}')">✕</button>
    `;

    // Drag events
    card.addEventListener('dragstart', e => {
      state.stitch.dragSrcIdx = idx;
      card.classList.add('dragging-card');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging-card'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const src = state.stitch.dragSrcIdx;
      const dst = idx;
      if (src !== null && src !== dst) {
        const imgs = state.stitch.images;
        const [moved] = imgs.splice(src, 1);
        imgs.splice(dst, 0, moved);
        state.stitch.dragSrcIdx = null;
        renderImgGrid();
      }
    });

    grid.appendChild(card);
  });

  const countEl = document.getElementById('imgCount');
  if (countEl) countEl.textContent = state.stitch.images.length;
  const clearBtn = document.getElementById('clearStitchImgsBtn');
  if (clearBtn) clearBtn.style.display = state.stitch.images.length ? '' : 'none';
}

async function deleteStitchImg(id) {
  if (!state.stitch.id) return;
  try {
    await apiFetch(`/api/stitch-image/${state.stitch.id}/${id}`, { method: 'DELETE' });
    state.stitch.images = state.stitch.images.filter(i => i.id !== id);
    renderImgGrid();
  } catch (e) {
    setStatus('stitchStatus', `删除失败: ${e.message}`);
  }
}

// --- Clear all stitch images ---
document.getElementById('clearStitchImgsBtn').addEventListener('click', async () => {
  if (!state.stitch.id || !state.stitch.images.length) return;
  if (!confirm(`确认清空全部 ${state.stitch.images.length} 张图片？`)) return;
  try {
    await apiFetch(`/api/stitch-clear/${state.stitch.id}`, { method: 'POST' });
    state.stitch.id = null;
    state.stitch.images = [];
    renderImgGrid();
    setStatus('stitchStatus', '图片列表已清空');
  } catch (e) {
    setStatus('stitchStatus', `清空失败: ${e.message}`);
  }
});

// --- Generate preview ---
document.getElementById('previewBtn').addEventListener('click', async () => {
  if (!state.stitch.id || !state.stitch.images.length) {
    alert('请先上传图片');
    return;
  }
  setStatus('stitchStatus', '生成预览...', true);
  document.getElementById('previewBtn').disabled = true;

  try {
    // Send current order
    const order = state.stitch.images.map(i => i.id);
    await apiFetch('/api/reorder-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stitch_id: state.stitch.id, order }),
    });

    const params = getStitchParams();
    const res = await apiFetch('/api/stitch-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stitch_id: state.stitch.id, ...params }),
    });
    const data = await res.json();

    const previewWrap = document.getElementById('previewImgWrap');
    previewWrap.innerHTML = `<img src="${data.preview_url}?t=${Date.now()}" alt="预览">`;
    setStatus('stitchStatus', '预览生成完成');
  } catch (e) {
    setStatus('stitchStatus', `预览失败: ${e.message}`);
  } finally {
    document.getElementById('previewBtn').disabled = false;
  }
});

// --- Export stitch ---
document.getElementById('exportStitchBtn').addEventListener('click', async () => {
  if (!state.stitch.id || !state.stitch.images.length) {
    alert('请先上传图片');
    return;
  }
  setStatus('stitchStatus', '导出中...', true);

  try {
    const order = state.stitch.images.map(i => i.id);
    await apiFetch('/api/reorder-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stitch_id: state.stitch.id, order }),
    });

    const params = getStitchParams();
    const res = await apiFetch('/api/stitch-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stitch_id: state.stitch.id, ...params }),
    });

    const blob = await res.blob();
    const ext = params.fmt === 'JPEG' ? 'jpg' : 'png';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stitched.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('stitchStatus', '导出完成');
  } catch (e) {
    setStatus('stitchStatus', `导出失败: ${e.message}`);
  }
});

function getStitchParams() {
  const direction = document.querySelector('input[name="direction"]:checked').value;
  return {
    direction,
    cols: parseInt(document.getElementById('colsInput').value) || null,
    rows: parseInt(document.getElementById('rowsInput').value) || null,
    row_gap: parseInt(document.getElementById('rowGapInput').value) || 10,
    col_gap: parseInt(document.getElementById('colGapInput').value) || 10,
    bg_color: document.getElementById('bgColorInput').value,
    fmt: document.getElementById('stitchFmtSelect').value,
    quality: parseInt(document.getElementById('qualityInput').value) || 90,
  };
}

// Direction toggle
document.querySelectorAll('input[name="direction"]').forEach(r => {
  r.addEventListener('change', () => {
    const isH = r.value === 'horizontal';
    document.getElementById('colsRow').style.display = isH ? '' : 'none';
    document.getElementById('rowsRow').style.display = isH ? 'none' : '';
  });
});

setupStitchUpload();

// =====================================================
// REPORT TAB
// =====================================================

const SCENE_PROMPTS = {
  overview: `请分析以下产品截图，输出一份**产品整体分析报告**，使用 Markdown 格式，包含以下章节：

## 产品定位
## UI 风格
## 核心功能
## UX 亮点
## 改进空间

请结合截图中的具体内容给出详细分析。`,

  ux: `请分析以下产品截图，输出一份**UI/UX 设计评估报告**，使用 Markdown 格式，包含以下章节：

## 视觉设计
## 交互设计
## 信息架构
## 设计亮点
## 设计问题

请结合截图中的具体内容给出详细分析。`,

  features: `请分析以下产品截图，输出一份**功能清单梳理报告**，使用 Markdown 格式，包含以下章节：

## 功能列表
（以表格或列表形式列出所有可见功能）

## 功能说明
（对每个功能进行简要说明）

## 差异化功能
（特别有亮点或独特的功能）

## 完整性评估
（与同类产品相比，功能是否完整）

请结合截图中的具体内容给出详细分析。`,

  compare: `请分析以下产品截图，输出一份**竞品横向对比报告**，使用 Markdown 格式，包含以下章节：

## 功能对比矩阵
（如有多个产品的截图，列出功能对比表格）

## 设计风格对比

## 优劣势分析

## 综合评估

请结合截图中的具体内容给出详细分析。`,

  custom: '',
};

// --- Report image upload ---
function setupReportUpload() {
  const zone = document.getElementById('reportUploadZone');
  const input = document.getElementById('reportFileInput');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    if (e.dataTransfer.files.length) handleReportImgFiles(Array.from(e.dataTransfer.files));
  });
  input.addEventListener('change', () => {
    if (input.files.length) handleReportImgFiles(Array.from(input.files));
    input.value = '';
  });
}

async function handleReportImgFiles(files) {
  setStatus('reportStatus', `上传 ${files.length} 张图片...`, true);
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));

  const url = state.report.id
    ? `/api/upload-report-images?report_id=${state.report.id}`
    : '/api/upload-report-images';

  try {
    const res = await apiFetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    if (!state.report.id) {
      state.report.id = data.report_id;
      state.report.images = data.images;
    } else {
      state.report.images.push(...data.images);
    }
    renderReportImgGrid();
    setStatus('reportStatus', `已加载 ${state.report.images.length} 张图片`);
  } catch (e) {
    setStatus('reportStatus', `上传失败: ${e.message}`);
  }
}

// --- Render report image grid ---
function renderReportImgGrid() {
  const grid = document.getElementById('reportImgGrid');
  const countEl = document.getElementById('reportImgCount');
  grid.innerHTML = '';
  countEl.textContent = state.report.images.length;
  const clearReportBtn = document.getElementById('clearReportImgsBtn');
  if (clearReportBtn) clearReportBtn.style.display = state.report.images.length ? '' : 'none';

  if (!state.report.images.length) {
    grid.innerHTML = '<div class="preview-placeholder" style="width:100%;">暂无图片，请上传或从视频截图发送</div>';
    return;
  }

  state.report.images.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.draggable = true;
    card.dataset.idx = idx;
    card.dataset.id = img.id;

    card.innerHTML = `
      <img src="${img.url}" alt="${img.filename}" loading="lazy">
      <div class="img-idx">${idx + 1}</div>
      <button class="img-del" title="删除" onclick="deleteReportImg('${img.id}')">✕</button>
    `;

    card.addEventListener('dragstart', e => {
      state.report.dragSrcIdx = idx;
      card.classList.add('dragging-card');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging-card'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const src = state.report.dragSrcIdx;
      const dst = idx;
      if (src !== null && src !== dst) {
        const [moved] = state.report.images.splice(src, 1);
        state.report.images.splice(dst, 0, moved);
        state.report.dragSrcIdx = null;
        renderReportImgGrid();
      }
    });

    grid.appendChild(card);
  });
}

async function deleteReportImg(id) {
  if (!state.report.id) return;
  try {
    await apiFetch(`/api/report-image/${state.report.id}/${id}`, { method: 'DELETE' });
    state.report.images = state.report.images.filter(i => i.id !== id);
    renderReportImgGrid();
  } catch (e) {
    setStatus('reportStatus', `删除失败: ${e.message}`);
  }
}

// --- Clear all report images ---
document.getElementById('clearReportImgsBtn').addEventListener('click', async () => {
  if (!state.report.id || !state.report.images.length) return;
  if (!confirm(`确认清空全部 ${state.report.images.length} 张图片？`)) return;
  try {
    await apiFetch(`/api/report-clear/${state.report.id}`, { method: 'POST' });
    state.report.id = null;
    state.report.images = [];
    renderReportImgGrid();
    setStatus('reportStatus', '图片列表已清空');
  } catch (e) {
    setStatus('reportStatus', `清空失败: ${e.message}`);
  }
});

// --- Scene card selection ---
document.querySelectorAll('.scene-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const scene = card.dataset.scene;
    state.report.scene = scene;
    document.getElementById('reportPrompt').value = SCENE_PROMPTS[scene] || '';
  });
});

// Initialize prompt with default scene
document.getElementById('reportPrompt').value = SCENE_PROMPTS['overview'];

// --- Generate report ---
document.getElementById('generateReportBtn').addEventListener('click', async () => {
  if (!state.report.id || !state.report.images.length) {
    alert('请先上传图片或从视频截图发送');
    return;
  }
  const prompt = document.getElementById('reportPrompt').value.trim();
  if (!prompt) {
    alert('请输入或选择 Prompt');
    return;
  }

  state.report.loading = true;
  const btn = document.getElementById('generateReportBtn');
  btn.disabled = true;
  setStatus('reportStatus', '正在调用 Claude API 生成报告...', true);
  document.getElementById('reportOutputPanel').style.display = 'none';

  try {
    const res = await apiFetch('/api/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report_id: state.report.id,
        image_ids: state.report.images.map(i => i.id),
        prompt,
      }),
    });
    const data = await res.json();
    state.report.content = data.report;
    state.report.prompt = prompt;

    document.getElementById('reportContent').innerHTML = marked.parse(data.report);
    document.getElementById('reportOutputPanel').style.display = '';
    setStatus('reportStatus', '报告生成完成');
  } catch (e) {
    setStatus('reportStatus', `生成失败: ${e.message}`);
  } finally {
    state.report.loading = false;
    btn.disabled = false;
  }
});

// --- Copy report ---
document.getElementById('copyReportBtn').addEventListener('click', () => {
  if (!state.report.content) return;
  navigator.clipboard.writeText(state.report.content).then(() => {
    setStatus('reportStatus', '已复制到剪贴板');
  });
});

// --- Download report ---
document.getElementById('downloadReportBtn').addEventListener('click', () => {
  if (!state.report.content) return;
  const blob = new Blob([state.report.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report.md';
  a.click();
  URL.revokeObjectURL(url);
});

setupReportUpload();
