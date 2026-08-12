// ================================================
// js/app.js — 前端交互（视图层）
// 依赖 js/store.js 暴露的 ItemStore 接口；不直接碰 GitHub。
// 全程零 emoji：图标统一走内联 SVG（ICONS），提示走 Toast。
// ================================================

// ─── 内联 SVG 图标（stroke=currentColor，随文字着色） ───
const ICONS = {
  pin: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></svg>',
  phone: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 3h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></svg>',
  calendar: '<svg class="icon" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>',
  doc: '<svg class="icon" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 13l4 4 10-11"/></svg>',
  chevron: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  xCircle: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  checkCircle: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.2 2.2L15.5 10"/></svg>',
  infoCircle: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  alertCircle: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/></svg>',
};

let userLat = null;
let userLng = null;
let currentRange = 1000;
let allItems = [];
let currentBorrowId = null;
let currentManageItem = null;

function initApp(pageType) {
  if (pageType === 'index') initIndexPage();
  else if (pageType === 'publish') initPublishPage();
}

// ─── Haversine 距离（米） ───
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('浏览器不支持定位'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ═══════════════════════════════
// 首页
// ═══════════════════════════════
async function initIndexPage() {
  const loadingEl = document.getElementById('loading');
  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('empty-state');
  const locationTextEl = document.getElementById('locationText');
  const locationStatusEl = document.getElementById('locationStatus');

  try {
    const pos = await getLocation();
    userLat = pos.lat; userLng = pos.lng;
    locationTextEl.textContent = '已定位';
    if (locationStatusEl) locationStatusEl.classList.add('is-ready');
  } catch (e) {
    locationTextEl.textContent = '未授权定位（显示全部）';
    if (locationStatusEl) locationStatusEl.classList.add('is-off');
    currentRange = 0;
    document.querySelectorAll('.filter-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.range === '0');
    });
  }

  try {
    allItems = await ItemStore.list();
    loadingEl.style.display = 'none';
    renderFilteredItems(listEl, emptyEl);
  } catch (err) {
    loadingEl.innerHTML = `<p style="color:var(--error)">加载失败：${escapeHtml(err.message)}</p>`;
  }
}

window.setRange = function (range) {
  currentRange = range;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', Number(p.dataset.range) === range);
  });
  renderFilteredItems(document.getElementById('item-list'), document.getElementById('empty-state'));
};

async function reloadList(forceLive) {
  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('empty-state');
  try { allItems = await ItemStore.list({ forceLive: !!forceLive }); renderFilteredItems(listEl, emptyEl); }
  catch (e) { showToast('刷新失败', e.message, 'error'); }
}

// 强制刷新：跳过静态快照与本地缓存，直接拉取 GitHub 实时数据
window.refreshList = async function () {
  const btn = document.getElementById('btnRefresh');
  if (btn) btn.classList.add('spinning');
  await reloadList(true);
  if (btn) btn.classList.remove('spinning');
  showToast('已刷新', '已拉取最新物品', 'success');
};

function renderFilteredItems(listEl, emptyEl) {
  let filtered = allItems;
  if (currentRange > 0 && userLat && userLng) {
    filtered = allItems.filter(item => {
      if (!item.lat || !item.lng) return true;
      return calcDistance(userLat, userLng, item.lat, item.lng) <= currentRange;
    });
  }

  const rc = document.getElementById('resultsCount');
  if (rc) rc.innerHTML = `共 <b>${filtered.length}</b> 件闲置`;

  if (!filtered || filtered.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = 'flex';
  } else {
    emptyEl.style.display = 'none';
    listEl.style.display = 'grid';
    renderItems(filtered, listEl);
    initLazyLoad();
  }
}

function statusBadge(item) {
  if (item.status === 'borrowed') return '<span class="status-badge lent">已借出</span>';
  if (item.status === 'requested') return '<span class="status-badge requested">待确认</span>';
  return '<span class="status-badge available">闲置中</span>';
}

function borrowBtnHtml(item) {
  const reqId = sessionStorage.getItem('req_' + item.id);
  if (item.status === 'borrowed') return '<button class="btn-borrow disabled" disabled>已借出</button>';
  if (item.status === 'requested') {
    if (reqId) return `<button class="btn-borrow" onclick="cancelMyRequest(${item.id})">已申请 · 取消</button>`;
    return '<button class="btn-borrow disabled" disabled>已被申请</button>';
  }
  return `<button class="btn-borrow" onclick="openBorrowModal(${item.id})">我想借</button>`;
}

function renderItems(items, container) {
  container.innerHTML = '';
  items.forEach(item => {
    const safeName = escapeHtml(item.name || '未知物品');
    const safeDesc = escapeHtml(item.desc || '无描述');
    const safeContact = escapeHtml(item.contact || '');
    const safeBuilding = escapeHtml(item.building || '');
    const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f3efe7%22%2F%3E%3Cpath%20d%3D%22M8%2024%2032%2010l24%2014%22%20stroke%3D%22%23cfc9bd%22%20fill%3D%22none%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M12%2022v22l20%2012%2020-12V22%22%20stroke%3D%22%23cfc9bd%22%20fill%3D%22none%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M32%2034v22%22%20stroke%3D%22%23cfc9bd%22%20fill%3D%22none%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E';

    let distStr = '';
    if (userLat && userLng && item.lat && item.lng) {
      const d = calcDistance(userLat, userLng, item.lat, item.lng);
      distStr = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
    }
    let dateStr = '刚刚';
    if (item.createTime) {
      const d = new Date(item.createTime);
      if (!isNaN(d.getTime())) dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    const distTag = distStr
      ? `<span class="distance-tag">${ICONS.pin}${distStr}</span>`
      : '';
    const cardClass = 'card' + (item.status === 'borrowed' ? ' is-lent' : (item.status === 'requested' ? ' is-requested' : ''));

    const detailRows = [];
    if (safeBuilding) detailRows.push(`<div class="detail-row"><span class="detail-label">${ICONS.home}楼号</span><span class="detail-value">${safeBuilding}</span></div>`);
    if (safeContact) detailRows.push(`<div class="detail-row"><span class="detail-label">${ICONS.phone}联系方式</span><span class="detail-value">${safeContact}</span></div>`);
    if (distStr) detailRows.push(`<div class="detail-row"><span class="detail-label">${ICONS.pin}距您</span><span class="detail-value">${distStr}</span></div>`);
    detailRows.push(`<div class="detail-row"><span class="detail-label">${ICONS.calendar}发布</span><span class="detail-value">${dateStr}</span></div>`);
    detailRows.push(`<div class="detail-row"><span class="detail-label">${ICONS.doc}描述</span><span class="detail-value">${safeDesc}</span></div>`);

    const metaLeft = safeBuilding
      ? `<span class="meta-left">${ICONS.home}<span class="building-info">${safeBuilding}</span></span>`
      : `<span class="meta-left">${dateStr}</span>`;
    const metaDist = distStr ? `<span class="meta-dist">${distStr}</span>` : '';

    const card = document.createElement('div');
    card.className = cardClass;
    card.innerHTML = `
      <div class="card-img-wrapper">
        <img class="card-img lazy" src="${defaultImg}" data-src="${item.imgUrl || defaultImg}" alt="${safeName}">
        ${statusBadge(item)}
        ${distTag}
      </div>
      <div class="card-content">
        <h3 class="card-title" title="${safeName}">${safeName}</h3>
        <p class="card-desc" title="${safeDesc}">${safeDesc}</p>
        <div class="card-meta">
          ${metaLeft}
          ${metaDist}
        </div>
        <div class="card-actions">
          ${borrowBtnHtml(item)}
          <button class="btn-manage" onclick="openManageModal(${item.id})">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>
            管理
          </button>
        </div>
        <div class="detail-panel" style="display:none;">
          ${detailRows.join('')}
          <button class="btn-collapse" onclick="toggleDetail(this)">收起${ICONS.chevron}</button>
        </div>
      </div>`;
    container.appendChild(card);
  });
}

window.toggleDetail = function (btnEl) {
  const card = btnEl.closest('.card');
  const panel = card.querySelector('.detail-panel');
  const borrowBtn = card.querySelector('.btn-borrow');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btnEl.classList.add('is-open');
    if (borrowBtn && !borrowBtn.classList.contains('disabled') && borrowBtn.textContent === '我想借') borrowBtn.innerText = '收起详情';
  } else {
    panel.style.display = 'none';
    btnEl.classList.remove('is-open');
    if (borrowBtn && borrowBtn.textContent === '收起详情') borrowBtn.innerText = '我想借';
  }
};

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function initLazyLoad() {
  const imgs = document.querySelectorAll("img.lazy");
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.src = e.target.dataset.src;
          e.target.classList.remove("lazy");
          obs.unobserve(e.target);
        }
      });
    });
    imgs.forEach(img => obs.observe(img));
  } else {
    imgs.forEach(img => { img.src = img.dataset.src; });
  }
}

// ═══════════════════════════════
// 借阅弹窗
// ═══════════════════════════════
window.openBorrowModal = function (id) {
  currentBorrowId = id;
  document.getElementById('borrowModal').style.display = 'flex';
  document.getElementById('borrowName').value = '';
  document.getElementById('borrowContact').value = '';
  document.getElementById('borrowMsg').value = '';
};
window.closeBorrowModal = function () {
  document.getElementById('borrowModal').style.display = 'none';
};

window.submitBorrow = async function () {
  const id = currentBorrowId;
  const fromName = document.getElementById('borrowName').value.trim();
  const contact = document.getElementById('borrowContact').value.trim();
  const message = document.getElementById('borrowMsg').value.trim();
  if (!fromName || !contact) { showToast('请填写完整', '昵称和联系方式不能为空', 'warning'); return; }
  try {
    const r = await ItemStore.requestBorrow(id, { fromName, contact, message });
    const rid = r.id || r.requestId;
    sessionStorage.setItem('req_' + id, rid);
    const item = allItems.find(x => x.id === id);
    if (item) {
      item.requests.push({ id: rid, fromName, contact, message, createdAt: new Date().toISOString(), status: 'pending' });
      if (item.status === 'available') item.status = 'requested';
    }
    closeBorrowModal();
    renderFilteredItems(document.getElementById('item-list'), document.getElementById('empty-state'));
    showToast('申请已发送', '物主会收到 GitHub 通知', 'success');
  } catch (e) { showToast('申请失败', e.message, 'error'); }
};

window.cancelMyRequest = async function (id) {
  const rid = sessionStorage.getItem('req_' + id);
  if (!rid) return;
  try {
    await ItemStore.cancelRequest(id, rid);
    sessionStorage.removeItem('req_' + id);
    const item = allItems.find(x => x.id === id);
    if (item) {
      const req = item.requests.find(r => r.id === rid);
      if (req) req.status = 'cancelled';
      if (!item.requests.some(r => r.status === 'pending')) item.status = 'available';
    }
    renderFilteredItems(document.getElementById('item-list'), document.getElementById('empty-state'));
    showToast('已取消申请', '', 'info');
  } catch (e) { showToast('取消失败', e.message, 'error'); }
};

// ═══════════════════════════════
// 管理弹窗（物主，PIN 校验在服务端代理）
// ═══════════════════════════════
const STATUS_TEXT = { available: '闲置中', requested: '待确认', borrowed: '已借出' };

window.openManageModal = function (id) {
  currentManageItem = allItems.find(x => x.id === id);
  if (!currentManageItem) return;
  document.getElementById('manageModal').style.display = 'flex';
  const localPin = localStorage.getItem(`pin_${id}`);
  document.getElementById('managePinInput').value = localPin || '';
  renderManageBody(currentManageItem);
};

function renderManageBody(item) {
  const body = document.getElementById('manageBody');
  let html = `<p style="font-size:var(--fs-sm);color:var(--text-3);margin-bottom:var(--sp-3);">当前状态：<b style="color:var(--text-1)">${STATUS_TEXT[item.status] || item.status}</b></p>`;
  const pend = (item.requests || []).filter(r => r.status === 'pending');
  if (pend.length) {
    html += '<div class="req-list">';
    pend.forEach(r => {
      const rid = escapeHtml(r.id);
      html += `<div class="req-item">
        <div class="req-meta">${ICONS.phone}<b>${escapeHtml(r.fromName)}</b> · ${escapeHtml(r.contact || '')}</div>
        <div class="req-msg">${escapeHtml(r.message || '（无留言）')}</div>
        <div class="req-actions">
          <button class="btn-sm btn-success" onclick="manageAct('confirm', ${item.id}, '${rid}')">${ICONS.check}确认借出</button>
          <button class="btn-sm btn-danger" onclick="manageAct('reject', ${item.id}, '${rid}')">${ICONS.xCircle}拒绝</button>
        </div></div>`;
    });
    html += '</div>';
  }
  if (item.status === 'borrowed') {
    html += `<button class="btn btn-success btn-block" style="margin-top:var(--sp-3);" onclick="manageAct('return', ${item.id})">${ICONS.checkCircle}确认归还</button>`;
  }
  html += `<button class="btn btn-danger btn-block" style="margin-top:var(--sp-3);" onclick="manageAct('delete', ${item.id})">${ICONS.trash}永久下架</button>`;
  body.innerHTML = html;
}

window.manageAct = async function (action, id, requestId) {
  const pin = document.getElementById('managePinInput').value.trim();
  if (!pin) { showToast('请输入管理密码', '请填写 4 位 PIN', 'warning'); return; }
  try {
    if (action === 'confirm') await ItemStore.confirmBorrow(id, pin, requestId);
    else if (action === 'reject') await ItemStore.rejectRequest(id, requestId, pin);
    else if (action === 'return') await ItemStore.confirmReturn(id, pin);
    else if (action === 'delete') {
      if (!confirm('确定永久下架？此操作不可恢复。')) return;
      await ItemStore.remove(id, pin);
      sessionStorage.removeItem('req_' + id);
    }
    showToast('操作成功', '', 'success');
    closeManageModal();
    await reloadList();
  } catch (e) { showToast('操作失败', e.message, 'error'); }
};

window.closeManageModal = function () {
  document.getElementById('manageModal').style.display = 'none';
};

// ═══════════════════════════════
// 发布页
// ═══════════════════════════════
function initPublishPage() {
  const form = document.getElementById('publish-form');
  const fileInput = document.getElementById('itemImage');
  const previewImg = document.getElementById('previewImg');
  const previewContainer = document.getElementById('imagePreview');
  const submitBtn = document.getElementById('submitBtn');
  const progressContainer = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  fileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { showToast('图片过大', '图片不能超过 5MB', 'warning'); this.value = ''; previewContainer.style.display = 'none'; return; }
      const reader = new FileReader();
      reader.onload = e => { previewImg.src = e.target.result; previewContainer.style.display = 'block'; };
      reader.readAsDataURL(file);
    } else { previewContainer.style.display = 'none'; }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('itemName').value.trim();
    const desc = document.getElementById('itemDesc').value.trim();
    const contact = document.getElementById('itemContact').value.trim();
    const building = document.getElementById('itemBuilding').value.trim();
    const lat = parseFloat(document.getElementById('itemLat').value) || null;
    const lng = parseFloat(document.getElementById('itemLng').value) || null;
    const file = fileInput.files[0];

    if (!contact && !building) { showToast('请填写联系方式', '楼号与联系方式至少填写一项', 'warning'); return; }
    if (!lat || !lng) { showToast('请先定位', '点击「获取位置」完成定位', 'warning'); return; }
    let pin = document.getElementById('itemPin').value.trim();
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
    }
    if (!file) { showToast('请选择照片', '物品照片为必填项', 'warning'); return; }

    if (!ItemStore.proxyReady()) {
      showToast('代理未部署', '暂时无法发布。请按 DEPLOY.md 部署 Cloudflare Worker 后填入 API_PROXY（js/store.js 顶部）。', 'warning', 7000);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = '正在发布…';
    progressContainer.style.display = 'block';
    try {
      progressText.innerText = '正在压缩图片…';
      const imgUrl = await compressImageToBase64(file);
      progressText.innerText = '正在保存信息…';
      const newId = await ItemStore.create({ name, desc, contact, building, lat, lng, imgUrl, pin });
      localStorage.setItem(`pin_${newId}`, pin);
      showToast('发布成功', `管理 PIN：${pin}（已自动保存在本设备）`, 'success', 7000);
      window.location.href = 'index.html';
    } catch (err) {
      showToast('发布失败', err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerText = '发布物品';
      progressContainer.style.display = 'none';
    }
  });
}

function setLocateLabel(btn, text, located) {
  btn.innerHTML = `${ICONS.pin}${text}`;
  btn.classList.toggle('located', !!located);
}

window.doLocate = async function () {
  const btn = document.getElementById('btnLocate');
  const status = document.getElementById('locateStatus');
  setLocateLabel(btn, '定位中…', false);
  try {
    const pos = await getLocation();
    document.getElementById('itemLat').value = pos.lat;
    document.getElementById('itemLng').value = pos.lng;
    setLocateLabel(btn, '已定位', true);
    status.textContent = '正在获取地址…';
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&accept-language=zh`, {
        headers: { 'User-Agent': 'NeighborhoodSharing/1.0' }
      });
      const geoData = await geoRes.json();
      const addr = geoData.display_name || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
      const parts = addr.split(',').map(s => s.trim());
      status.textContent = parts.slice(0, 3).join(', ');
    } catch (e) {
      status.textContent = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    }
    const mapContainer = document.getElementById('miniMap');
    if (mapContainer) {
      mapContainer.style.display = 'block';
      mapContainer.innerHTML = `<iframe width="100%" height="180" style="border:none;border-radius:10px;" loading="lazy"
        src="https://www.openstreetmap.org/export/embed.html?bbox=${pos.lng - 0.005},${pos.lat - 0.003},${pos.lng + 0.005},${pos.lat + 0.003}&layer=mapnik&marker=${pos.lat},${pos.lng}"></iframe>`;
    }
  } catch (err) {
    setLocateLabel(btn, '点击获取位置', false);
    status.textContent = '请允许浏览器定位权限';
  }
};

// ═══════════════════════════════
// Toast 通知（替代原生 alert，非阻塞）
// ═══════════════════════════════
function showToast(title, msg, type = 'info', duration = 2800) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const iconMap = {
    success: ICONS.checkCircle,
    error: ICONS.xCircle,
    info: ICONS.infoCircle,
    warning: ICONS.alertCircle,
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="t-icon">${iconMap[type] || ICONS.infoCircle}</span>
    <div class="t-body">
      <div class="t-title">${escapeHtml(title)}</div>
      ${msg ? `<div class="t-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
    <button class="t-close" aria-label="关闭">×</button>`;
  const remove = () => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector('.t-close').addEventListener('click', remove);
  wrap.appendChild(toast);
  if (duration > 0) setTimeout(remove, duration);
}
