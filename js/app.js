// ================================================
// 邻里好物 — 前端交互逻辑
// ================================================

// 全局状态
let userLat = null;
let userLng = null;
let currentRange = 1000; // 默认 1km
let allItems = [];        // 缓存全部物品

function initApp(pageType) {
    if (pageType === 'index') initIndexPage();
    else if (pageType === 'publish') initPublishPage();
}

// ─── Haversine 距离计算 (米) ───
function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 获取位置 (Promise) ───
function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持定位'));
            return;
        }
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

    // 1. 尝试获取用户位置
    try {
        const pos = await getLocation();
        userLat = pos.lat;
        userLng = pos.lng;
        locationTextEl.textContent = '已定位 ✓';
    } catch (e) {
        locationTextEl.textContent = '未授权定位 (显示全部)';
        currentRange = 0; // 显示全部
        // 更新 pill 状态
        document.querySelectorAll('.filter-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.range === '0');
        });
    }

    // 2. 拉取物品
    try {
        allItems = await loadItems();
        loadingEl.style.display = 'none';
        renderFilteredItems(listEl, emptyEl);
    } catch (err) {
        loadingEl.innerHTML = `<p style="color:#ef4444">加载失败: ${err.message}</p>`;
    }
}

// 距离筛选
window.setRange = function (range) {
    currentRange = range;
    document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', Number(p.dataset.range) === range);
    });
    const listEl = document.getElementById('item-list');
    const emptyEl = document.getElementById('empty-state');
    renderFilteredItems(listEl, emptyEl);
};

function renderFilteredItems(listEl, emptyEl) {
    let filtered = allItems;

    if (currentRange > 0 && userLat && userLng) {
        filtered = allItems.filter(item => {
            if (!item.lat || !item.lng) return true; // 无坐标的显示
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

// ─── 渲染卡片 ───
function renderItems(items, container) {
    container.innerHTML = '';

    items.forEach(item => {
        const safeName = escapeHtml(item.name || '未知物品');
        const safeDesc = escapeHtml(item.desc || '无描述');
        const safeContact = escapeHtml(item.contact || '');
        const safeBuilding = escapeHtml(item.building || '');
        const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23e2e8f0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%20font-family%3D%22sans-serif%22%20fill%3D%22%2394a3b8%22%3E%E5%9B%BE%E7%89%87%3C%2Ftext%3E%3C%2Fsvg%3E';

        // 距离
        let distStr = '';
        if (userLat && userLng && item.lat && item.lng) {
            const d = calcDistance(userLat, userLng, item.lat, item.lng);
            distStr = d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
        }

        // 日期
        let dateStr = '刚刚';
        if (item.createTime) {
            const d = new Date(item.createTime);
            if (!isNaN(d.getTime())) {
                dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
            }
        }

        // 联系信息文本
        const contactDisplay = safeContact || (safeBuilding ? `🏠 ${safeBuilding}` : '未提供');

        const card = document.createElement('div');
        card.className = 'card' + (item.isLent ? ' is-lent' : '');

        const statusBadge = item.isLent
            ? '<span class="status-badge lent">已借出</span>'
            : '<span class="status-badge available">闲置中</span>';

        const distTag = distStr ? `<span class="distance-tag">📍 ${distStr}</span>` : '';

        const borrowBtnClass = item.isLent ? 'btn-borrow disabled' : 'btn-borrow';
        const borrowBtnText = item.isLent ? '已借出' : '我想借';

        card.innerHTML = `
      <div class="card-img-wrapper">
        <img class="card-img lazy" src="${defaultImg}" data-src="${item.imgUrl || defaultImg}" alt="${safeName}">
        ${statusBadge}
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
          <button class="${borrowBtnClass}" ${item.isLent ? 'disabled' : ''} onclick="showContact(this, '${contactDisplay}')">${borrowBtnText}</button>
          <button class="btn-manage" onclick="openManageModal(${item.id}, ${item.isLent}, '${item.pin || ''}')">管理</button>
        </div>
      </div>`;

        container.appendChild(card);
    });
}

// ─── 显示联系方式 ───
window.showContact = function (btnEl, contactText) {
    if (btnEl.classList.contains('disabled')) return;
    const card = btnEl.closest('.card');
    const actionsDiv = card.querySelector('.card-actions');
    actionsDiv.innerHTML = `<div class="contact-info" style="width:100%">${contactText}</div>`;
}

// ─── XSS 转义 ───
function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ─── 懒加载 ───
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

    // 图片预览
    fileInput.addEventListener('change', function () {
        const file = this.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert("图片不能超过 5MB");
                this.value = '';
                previewContainer.style.display = 'none';
                return;
            }
            const reader = new FileReader();
            reader.onload = e => {
                previewImg.src = e.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewContainer.style.display = 'none';
        }
    });

    // 表单提交
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('itemName').value.trim();
        const desc = document.getElementById('itemDesc').value.trim();
        const contact = document.getElementById('itemContact').value.trim();
        const building = document.getElementById('itemBuilding').value.trim();
        const lat = parseFloat(document.getElementById('itemLat').value) || null;
        const lng = parseFloat(document.getElementById('itemLng').value) || null;
        const file = fileInput.files[0];

        // 验证: 楼号和联系方式至少填一个
        if (!contact && !building) {
            alert("请至少填写 楼号 或 联系方式 中的一个！");
            return;
        }

        if (!lat || !lng) {
            alert("请先点击「获取位置」完成定位！");
            return;
        }

        let pin = document.getElementById('itemPin').value.trim();
        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            pin = Math.floor(1000 + Math.random() * 9000).toString();
        }

        if (!file) { alert("请选择物品照片！"); return; }

        submitBtn.disabled = true;
        submitBtn.innerText = '正在发布...';
        progressContainer.style.display = 'block';

        try {
            progressText.innerText = '正在压缩图片...';
            const imgUrl = await compressImageToBase64(file);

            progressText.innerText = '正在保存信息...';
            const newIssueId = await addItem(name, desc, contact, building, lat, lng, imgUrl, pin);

            localStorage.setItem(`pin_${newIssueId}`, pin);

            alert(`发布成功！\n管理 PIN: ${pin}\n(已自动保存在本设备)`);
            window.location.href = 'index.html';
        } catch (err) {
            alert("发布失败：" + err.message);
            submitBtn.disabled = false;
            submitBtn.innerText = '🚀 发布物品';
            progressContainer.style.display = 'none';
        }
    });
}

// ─── 定位按钮 ───
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
        status.textContent = `坐标: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    } catch (err) {
        btn.innerText = '定位失败，重试';
        status.textContent = '请允许浏览器定位权限';
    }
};

// ═══════════════════════════════
// 管理弹窗
// ═══════════════════════════════
let currentManageIssueId = null;
let currentManagePin = null;

window.openManageModal = function (issueId, isLent, realPin) {
    currentManageIssueId = issueId;
    currentManagePin = realPin;

    document.getElementById('manageModal').style.display = 'flex';

    const btnLent = document.getElementById('btnSetLent');
    const btnAvailable = document.getElementById('btnSetAvailable');
    btnLent.style.display = isLent ? 'none' : 'block';
    btnAvailable.style.display = isLent ? 'block' : 'none';

    const localPin = localStorage.getItem(`pin_${issueId}`);
    document.getElementById('managePinInput').value = localPin || '';
};

window.closeManageModal = function () {
    document.getElementById('manageModal').style.display = 'none';
};

window.executeManageAction = async function (actionType) {
    const inputPin = document.getElementById('managePinInput').value.trim();
    if (!inputPin) { alert("请输入 4 位管理密码！"); return; }
    if (currentManagePin && inputPin !== currentManagePin) { alert("密码错误！"); return; }

    try {
        if (actionType === 'lent') {
            await updateItemStatus(currentManageIssueId, 'lent');
            alert("已标记为【借出】！");
        } else if (actionType === 'available') {
            await updateItemStatus(currentManageIssueId, 'item');
            alert("已恢复为【闲置中】！");
        } else if (actionType === 'delete') {
            if (!confirm("确定要永久下架吗？")) return;
            await closeItem(currentManageIssueId);
            localStorage.removeItem(`pin_${currentManageIssueId}`);
            alert("已永久下架！");
        }
        window.location.reload();
    } catch (err) {
        alert("操作失败: " + err.message);
    } finally {
        closeManageModal();
    }
};
