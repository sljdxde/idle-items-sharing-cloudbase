/**
 * 初始化不同页面的逻辑
 * @param {string} pageType - 'index' 或 'publish'
 */
function initApp(pageType) {
    if (pageType === 'index') {
        initIndexPage();
    } else if (pageType === 'publish') {
        initPublishPage();
    }
}

/**
 * 首页逻辑
 */
async function initIndexPage() {
    const loadingEl = document.getElementById('loading');
    const listEl = document.getElementById('item-list');
    const emptyEl = document.getElementById('empty-state');

    try {
        // 拉取数据
        const items = await loadItems();

        loadingEl.style.display = 'none';

        if (!items || items.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        listEl.style.display = 'grid';
        renderItems(items, listEl);

        // 启用图片懒加载 (利用 IntersectionObserver)
        if (typeof initLazyLoad === 'function') {
            initLazyLoad();
        }
    } catch (err) {
        loadingEl.innerHTML = `<p style="color:red">加载物品失败，请检查控制台及 ENV_ID: ${err.message}</p>`;
    }
}

/**
 * 渲染物品卡片
 */
function renderItems(items, container) {
    container.innerHTML = '';

    items.forEach(item => {
        // 安全转义避免 XSS
        const safeName = escapeHtml(item.name || '未知物品');
        const safeDesc = escapeHtml(item.desc || '无描述');
        const safeContact = escapeHtml(item.contact || '');
        const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22400%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23eeeeee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-size%3D%2218%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%20font-family%3D%22monospace%22%20fill%3D%22%23aaaaaa%22%3E%E5%9B%BE%E7%89%87%E5%8A%A0%E8%BD%BD%E4%B8%AD...%3C%2Ftext%3E%3C%2Fsvg%3E';

        const card = document.createElement('div');
        card.className = 'card';

        // 日期格式化
        let dateStr = '刚刚';
        if (item.createTime) {
            let d;
            // 处理 TCB ServerDate
            if (typeof item.createTime === 'object' && item.createTime.$date) {
                d = new Date(item.createTime.$date);
            } else {
                d = new Date(item.createTime);
            }

            if (!isNaN(d.getTime())) {
                dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
        }

        card.innerHTML = `
      <img class="card-img lazy" src="${defaultImg}" data-src="${item.imgUrl || defaultImg}" alt="${safeName}">
      <div class="card-content">
        <h3 class="card-title" title="${safeName}">${safeName}</h3>
        <p class="card-desc" title="${safeDesc}">${safeDesc}</p>
        <div class="card-date">${dateStr}</div>
        <div class="contact-area">
          <div class="contact-btn" onclick="showContact(this, '${safeContact}')">点击查看联系方式</div>
        </div>
      </div>
    `;
        container.appendChild(card);
    });
}

/**
 * 隐藏功能：点击查看联系方式
 */
window.showContact = function (btnEl, contactText) {
    const container = btnEl.parentElement;
    container.innerHTML = `<div class="contact-info">${contactText}</div>`;
}

/**
 * 简单的 XSS 转义
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 图片懒加载
 */
function initLazyLoad() {
    const lazyImages = [].slice.call(document.querySelectorAll("img.lazy"));

    if ("IntersectionObserver" in window) {
        let lazyImageObserver = new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    let lazyImage = entry.target;
                    lazyImage.src = lazyImage.dataset.src;
                    lazyImage.classList.remove("lazy");
                    lazyImageObserver.unobserve(lazyImage);
                }
            });
        });

        lazyImages.forEach(function (lazyImage) {
            lazyImageObserver.observe(lazyImage);
        });
    } else {
        // 降级处理
        lazyImages.forEach(function (lazyImage) {
            lazyImage.src = lazyImage.dataset.src;
        });
    }
}

/**
 * 发布页逻辑
 */
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
            // 验证大小 <= 5MB
            if (file.size > 5 * 1024 * 1024) {
                alert("图片大小不能超过 5MB");
                this.value = '';
                previewContainer.style.display = 'none';
                return;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewContainer.style.display = 'block';
            }
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
        const file = fileInput.files[0];

        if (!file) {
            alert("请选择要上传的图片！");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = '正在发布...';
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.innerText = '上传图\片: 0%';

        try {
            // 1. 压缩图片并转为 Base64
            progressText.innerText = '正在压缩处理图片...';
            const imgUrl = await compressImageToBase64(file);

            progressText.innerText = '图片上传完成，正在保存信息...';

            // 2. 将数据写入数据库
            await addItem(name, desc, contact, imgUrl);

            alert("发布成功！");
            window.location.href = 'index.html'; // 跳转回首页
        } catch (err) {
            alert("发布失败：" + err.message);
            submitBtn.disabled = false;
            submitBtn.innerText = '发布物品';
            progressContainer.style.display = 'none';
        }
    });
}
