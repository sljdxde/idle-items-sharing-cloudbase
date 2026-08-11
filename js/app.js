// ================================================
// js/app.js — 前端交互（视图层）
// 依赖 js/store.js 暴露的 ItemStore 接口；不直接碰 GitHub。
// ================================================

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

  try {
    const pos = await getLocation();
    userLat = pos.lat; userLng = pos.lng;
    locationTextEl.textContent = '已定位 ✓';
  } catch (e) {
    locationTextEl.textContent = '未授权定位 (显示全部)';
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
    loadingEl.innerHTML = `<p style="color:#ef4444">加载失败: ${escapeHtml(err.message)}</p>`;
  }
}

window.setRange = function (range) {
  currentRange = range;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', Number(p.dataset.range) === range);
  });
  renderFilteredItems(document.getElementById('item-list'), document.getElementById('empty-state'));
};

async function reloadList() {
  const listEl = document.getElementById('item-list');
  const emptyEl = document.getElementById('empty-state');
  try { allItems = await ItemStore.list(); renderFilteredItems(listEl, emptyEl); }
  catch (e) { alert('刷新失败: ' + e.message); }
}

function renderFilteredItems(listEl, emptyEl) {
  let filtered = allItems;
  if (currentRange > 0 && userLat && userLng) {
    filtered = allItems.filter(item => {
      if (!item.lat || !item.lng) return true;
      return calcDistance(userLat, userLng, item.lat, item.lng) <= currentRange;
    });
  }
  if (!filtered || filtered.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = 'block';
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
    const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23e2e8f0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%20font-family%3D%22sans-serif%22%20fill%3D%22%2394a3b8%22%3E%E5%9B%BE%E7%89%87%3C%2Ftext%3E%3C%2Fsvg%3E';

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
    const contactDisplay = safeContact || (safeBuilding ? `🏠 ${safeBuilding}` : '未提供');
    const distTag = distStr ? `<span class="distance-tag">📍 ${distStr}</span>` : '';
    const cardClass = 'card' + (item.status === 'borrowed' ? ' is-lent' : (item.status === 'requested' ? ' is-requested' : ''));

    const detailRows = [];
    if (safeBuilding) detailRows.push(`<div class="detail-row"><span class="detail-label">🏠 楼号</span><span class="detail-value">${safeBuilding}</span></div>`);
    if (safeContact) detailRows.push(`<div class="detail-row"><span class="detail-label">📱 联系方式</span><span class="detail-value">${safeContact}</span></div>`);
    if (distStr) detailRows.push(`<div class="detail-row"><span class="detail-label">📍 距您</span><span class="detail-value">${distStr}</span></div>`);
    detailRows.push(`<div class="detail-row"><span class="detail-label">📅 发布</span><span class="detail-value">${dateStr}</span></div>`);
    detailRows.push(`<div class="detail-row"><span class="detail-label">📝 描述</span><span class="detail-value">${safeDesc}</span></div>`);

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
          <span>${safeBuilding ? '🏠 ' + safeBuilding : dateStr}</span>
          ${distStr ? '<span style="color:var(--primary)">' + distStr + '</span>' : ''}
        </div>
        <div class="card-actions">
          ${borrowBtnHtml(item)}
          <button class="btn-manage" onclick="openManageModal(${item.id})">管理</button>
        </div>
        <div class="detail-panel" style="display:none;">
          ${detailRows.join('')}
          <button class="btn-collapse" onclick="toggleDetail(this)">收起 ▲</button>
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
    if (borrowBtn && !borrowBtn.classList.contains('disabled') && borrowBtn.textContent === '我想借') borrowBtn.innerText = '收起详情';
  } else {
    panel.style.display = 'none';
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
  if (!fromName || !contact) { alert('请填写昵称和联系方式'); return; }
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
    alert('申请已发送，物主会收到 GitHub 通知');
  } catch (e) { alert('申请失败: ' + e.message); }
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
    alert('已取消申请');
  } catch (e) { alert('取消失败: ' + e.message); }
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
  let html = `<p style="font-size:.82rem;color:#64748b;margin-bottom:10px;">当前状态：<b>${STATUS_TEXT[item.status] || item.status}</b></p>`;
  const pend = (item.requests || []).filter(r => r.status === 'pending');
  if (pend.length) {
    html += '<div class="req-list">';
    pend.forEach(r => {
      const rid = escapeHtml(r.id);
      html += `<div class="req-item">
        <div class="req-meta"><b>${escapeHtml(r.fromName)}</b> · ${escapeHtml(r.contact || '')}</div>
        <div class="req-msg">${escapeHtml(r.message || '（无留言）')}</div>
        <div class="req-actions">
          <button class="btn-success btn-sm" onclick="manageAct('confirm', ${item.id}, '${rid}')">确认借出</button>
          <button class="btn-danger btn-sm" onclick="manageAct('reject', ${item.id}, '${rid}')">拒绝</button>
        </div></div>`;
    });
    html += '</div>';
  }
  if (item.status === 'borrowed') {
    html += `<button class="btn-success" style="width:100%;margin-top:8px;" onclick="manageAct('return', ${item.id})">✨ 确认归还</button>`;
  }
  html += `<button class="btn-danger" style="width:100%;margin-top:8px;" onclick="manageAct('delete', ${item.id})">❌ 永久下架</button>`;
  body.innerHTML = html;
}

window.manageAct = async function (action, id, requestId) {
  const pin = document.getElementById('managePinInput').value.trim();
  if (!pin) { alert('请输入管理密码 PIN'); return; }
  try {
    if (action === 'confirm') await ItemStore.confirmBorrow(id, pin, requestId);
    else if (action === 'reject') await ItemStore.rejectRequest(id, requestId, pin);
    else if (action === 'return') await ItemStore.confirmReturn(id, pin);
    else if (action === 'delete') {
      if (!confirm('确定永久下架？')) return;
      await ItemStore.remove(id, pin);
      sessionStorage.removeItem('req_' + id);
    }
    alert('操作成功');
    closeManageModal();
    await reloadList();
  } catch (e) { alert('操作失败: ' + e.message); }
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
      if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); this.value = ''; previewContainer.style.display = 'none'; return; }
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

    if (!contact && !building) { alert('请至少填写 楼号 或 联系方式 中的一个！'); return; }
    if (!lat || !lng) { alert('请先点击「获取位置」完成定位！'); return; }
    let pin = document.getElementById('itemPin').value.trim();
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
    }
    if (!file) { alert('请选择物品照片！'); return; }

    if (!ItemStore.proxyReady()) {
      alert('代理未部署：暂时无法发布。请按 DEPLOY.md 部署 Cloudflare Worker 后填入 API_PROXY（js/store.js 顶部）。');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = '正在发布...';
    progressContainer.style.display = 'block';
    try {
      progressText.innerText = '正在压缩图片...';
      const imgUrl = await compressImageToBase64(file);
      progressText.innerText = '正在保存信息...';
      const newId = await ItemStore.create({ name, desc, contact, building, lat, lng, imgUrl, pin });
      localStorage.setItem(`pin_${newId}`, pin);
      alert(`发布成功！\n管理 PIN: ${pin}\n(已自动保存在本设备)`);
      window.location.href = 'index.html';
    } catch (err) {
      alert('发布失败：' + err.message);
      submitBtn.disabled = false;
      submitBtn.innerText = '🚀 发布物品';
      progressContainer.style.display = 'none';
    }
  });
}

window.doLocate = async function () {
  const btn = document.getElementById('btnLocate');
  const status = document.getElementById('locateStatus');
  btn.innerText = '定位中...';
  try {
    const pos = await getLocation();
    document.getElementById('itemLat').value = pos.lat;
    document.getElementById('itemLng').value = pos.lng;
    btn.innerText = '已定位 ✓';
    btn.classList.add('located');
    status.textContent = '正在获取地址...';
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&accept-language=zh`, {
        headers: { 'User-Agent': 'NeighborhoodSharing/1.0' }
      });
      const geoData = await geoRes.json();
      const addr = geoData.display_name || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
      const parts = addr.split(',').map(s => s.trim());
      status.textContent = `📍 ${parts.slice(0, 3).join(', ')}`;
    } catch (e) {
      status.textContent = `📍 ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    }
    const mapContainer = document.getElementById('miniMap');
    if (mapContainer) {
      mapContainer.style.display = 'block';
      mapContainer.innerHTML = `<iframe width="100%" height="180" style="border:none;border-radius:10px;" loading="lazy"
        src="https://www.openstreetmap.org/export/embed.html?bbox=${pos.lng - 0.005},${pos.lat - 0.003},${pos.lng + 0.005},${pos.lat + 0.003}&layer=mapnik&marker=${pos.lat},${pos.lng}"></iframe>`;
    }
  } catch (err) {
    btn.innerText = '定位失败，重试';
    status.textContent = '请允许浏览器定位权限';
  }
};
