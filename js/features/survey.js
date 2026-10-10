// ========== 问卷模块，对标 envelope 信箱代码 ==========
let surveyData = {
    surveyOutbox: [], // 你创建出去的问卷（待自动答卷 pending）
    surveyInbox: []   // 自动生成完成的答卷结果
};
let currentSurveyTab = 'surveyOutbox';
let editingSurveyId = null;
let editingSurveySection = null;
let surveyCheckTimer = null;
let isCheckingSurveyStatus = false;

async function loadSurveyData() {
    const saved = await localforage.getItem(getStorageKey('surveyData'));
    if (saved == null) return;
    if (!saved || !Array.isArray(saved.surveyOutbox) || !Array.isArray(saved.surveyInbox)) {
        throw new Error('问卷存档格式无效');
    }
    surveyData = saved;
}
function saveSurveyData() {
    return localforage.setItem(getStorageKey('surveyData'), surveyData);
}
function escapeSurveyHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}
/**
 * 生成随机问卷答案，必选规则：单选1项，多选至少1项
 */
function generateRandomSurveyAnswer(questions) {
    const answerData = {};
    for(const q of questions) {
        const optIds = q.options.map(o => o.id);
        if(q.type === "radio") {
            // 单选固定随机1个
            const randOpt = optIds[Math.floor(Math.random() * optIds.length)];
            answerData[q.id] = [randOpt];
        } else {
            // 多选随机勾选，保证至少选中1个
            const selected = [];
            for(const optId of optIds) {
                if(Math.random() > 0.4) selected.push(optId);
            }
            if(selected.length === 0) {
                selected.push(optIds[Math.floor(Math.random() * optIds.length)]);
            }
            answerData[q.id] = selected;
        }
    }
    return answerData;
}
/**
 * 核心检测函数，对标 checkEnvelopeStatus
 * 遍历outbox里pending问卷，到replyTime自动生成答卷，加入inbox
 */
async function checkSurveyStatus() {
    if (isCheckingSurveyStatus) return;
    isCheckingSurveyStatus = true;
    try {
        await loadSurveyData();
        const now = Date.now();
        let changed = false;
        let newSurveyResult = null;
        surveyData.surveyOutbox.forEach(survey => {
            if (survey.status === 'pending' && now >= survey.replyTime) {
                survey.status = 'completed';
                const answerResult = generateRandomSurveyAnswer(survey.questions);
                const resultId = 'survey_result_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
                const inboxSurvey = {
                    id: resultId,
                    refId: survey.id,
                    originalTitle: survey.title,
                    originalQuestions: survey.questions,
                    answerData: answerResult,
                    receivedTime: Date.now(),
                    isNew: true
                };
                surveyData.surveyInbox.push(inboxSurvey);
                newSurveyResult = inboxSurvey;
                changed = true;
                playSound('message');
            }
        });
        if (changed) {
            await saveSurveyData();
            renderSurveyLists();
            if (newSurveyResult) showSurveyCompletePopup(newSurveyResult);
        }
    } finally {
        isCheckingSurveyStatus = false;
    }
}
/**
 * 定时循环检测问卷状态
 */
function startSurveyTimer() {
    if (surveyCheckTimer) return;
    surveyCheckTimer = setInterval(() => {
        checkSurveyStatus().catch(error => {
            console.error('问卷状态检查失败:', error);
        });
    }, 3000);
}
/**
 * 完成弹窗，对标收到回信弹窗
 */
function showSurveyCompletePopup(surveyResult) {
    const existing = document.getElementById('survey-complete-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'survey-complete-popup';
    popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:20px;padding:18px 20px;z-index:8000;max-width:320px;width:88%;box-shadow:0 8px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:12px;animation:slideUpNotif 0.4s cubic-bezier(0.22,1,0.36,1);';
    popup.innerHTML = `
        <style>@keyframes slideUpNotif{from{opacity:0;transform:translateX(-50%) translateY(24px) scale(0.9)}60%{transform:translateX(-50%) translateY(-4px) scale(1.02)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}</style>
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:26px;">📋</span>
            <div>
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);">问卷已自动完成</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;opacity:0.8;">问卷收集完毕，查看答卷结果~</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;">
            <button onclick="document.getElementById('survey-complete-popup').remove();" style="flex:1;padding:8px 0;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-secondary);font-size:13px;cursor:pointer;">稍后查看</button>
            <button onclick="openSurveyAndViewResult('${escapeSurveyHtml(surveyResult.id)}');" style="flex:2;padding:8px 0;border-radius:12px;border:none;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">查看答卷 📋</button>
        </div>`;
    document.body.appendChild(popup);
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 8000);
}
window.openSurveyAndViewResult = function(resultId) {
    const popup = document.getElementById('survey-complete-popup');
    if (popup) popup.remove();
    const surveyModal = document.getElementById('survey-modal');
    showModal(surveyModal);
    setTimeout(() => {
        switchSurveyTab('surveyInbox');
        viewSurveyResult('surveyInbox', resultId);
    }, 200);
}
window.switchSurveyTab = function(tab) {
    currentSurveyTab = tab;
    document.getElementById('survey-tab-bar').style.display = 'flex';
    document.getElementById('survey-tab-outbox').classList.toggle('active', tab === 'surveyOutbox');
    document.getElementById('survey-tab-inbox').classList.toggle('active', tab === 'surveyInbox');
    document.getElementById('survey-outbox-section').style.display = tab === 'surveyOutbox' ? 'block' : 'none';
    document.getElementById('survey-inbox-section').style.display = tab === 'surveyInbox' ? 'block' : 'none';
    document.getElementById('survey-compose-form').style.display = 'none';
    document.getElementById('survey-main-close-btn').style.display = 'flex';
    renderSurveyLists();
}
function renderSurveyLists() {
    renderSurveyOutboxList();
    renderSurveyInboxList();
    const pendingCount = surveyData.surveyOutbox.filter(s => s.status === 'pending').length;
    const newResultCount = surveyData.surveyInbox.filter(s => s.isNew).length;
    const surveyOutboxBadge = document.getElementById('survey-outbox-badge');
    const surveyInboxBadge = document.getElementById('survey-inbox-badge');
    if (surveyOutboxBadge) { surveyOutboxBadge.textContent = pendingCount; surveyOutboxBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none'; }
    if (surveyInboxBadge) { surveyInboxBadge.textContent = newResultCount; surveyInboxBadge.style.display = newResultCount > 0 ? 'inline-block' : 'none'; }
    const surveyEntryBadge = document.getElementById('survey-entry-badge');
    if (surveyEntryBadge) {
        surveyEntryBadge.textContent = newResultCount;
        surveyEntryBadge.style.display = newResultCount > 0 ? 'inline-block' : 'none';
    }
}
function renderSurveyOutboxList() {
    const list = document.getElementById('survey-outbox-list');
    if (!list) return;
    if (surveyData.surveyOutbox.length === 0) {
        list.innerHTML = `<div class="env-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>
            <div style="font-size:14px;font-weight:500;margin-top:4px;">还没有创建问卷</div>
            <div style="font-size:12px;margin-top:6px;opacity:0.6;">创建限时问卷，等待自动收集答卷</div>
        </div>`;
        return;
    }
    list.innerHTML = surveyData.surveyOutbox.slice().reverse().map(survey => {
        const date = new Date(survey.createTime).toLocaleDateString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const isPending = survey.status === 'pending';
        const replyTime = isPending ? new Date(survey.replyTime).toLocaleDateString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
        const statusIcon = isPending
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
            : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        const statusText = isPending ? `${statusIcon} 预计 ${replyTime} 完成答卷` : `${statusIcon} 问卷已完成`;
        const preview = survey.title.length > 38 ? survey.title.substring(0, 38) + '…' : survey.title;
        return `
        <div class="env-letter-item" onclick="viewSurveyItem('surveyOutbox','${escapeSurveyHtml(survey.id)}')">
            <div class="env-letter-header">
                <div class="env-letter-header-from">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>
                    创建 · ${date}
                </div>
                <div class="env-stamp">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
            </div>
            <div class="env-letter-body">
                <div class="env-letter-preview">${escapeSurveyHtml(preview)}</div>
                <div class="env-letter-status">${statusText}</div>
            </div>
            <button class="env-letter-delete-btn" onclick="deleteSurveyItem(event,'surveyOutbox','${escapeSurveyHtml(survey.id)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`;
    }).join('');
}
function renderSurveyInboxList() {
    const list = document.getElementById('survey-inbox-list');
    if (!list) return;
    if (surveyData.surveyInbox.length === 0) {
        list.innerHTML = `<div class="env-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>
            <div style="font-size:14px;font-weight:500;margin-top:4px;">暂无问卷答卷</div>
            <div style="font-size:12px;margin-top:6px;opacity:0.6;">等待问卷自动生成结果</div>
        </div>`;
        return;
    }
    list.innerHTML = surveyData.surveyInbox.slice().reverse().map(result => {
        const date = new Date(result.receivedTime).toLocaleDateString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const preview = result.originalTitle.length > 50 ? result.originalTitle.substring(0, 50) + '…' : result.originalTitle;
        const isNew = result.isNew;
        return `
        <div class="env-letter-item reply ${isNew ? 'env-letter-new' : ''}" onclick="viewSurveyResult('surveyInbox','${escapeSurveyHtml(result.id)}')">
            <div class="env-letter-header">
                <div class="env-letter-header-from">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:3px;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>
                    答卷 · ${date}
                    ${isNew ? '<span style="background:rgba(255,255,255,0.3);color:#fff;font-size:9px;padding:1px 5px;border-radius:6px;margin-left:6px;">新</span>' : ''}
                </div>
                <div class="env-stamp">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
            </div>
            <div class="env-letter-body">
                <div class="env-letter-preview">${escapeSurveyHtml(preview)}</div>
            </div>
            <button class="env-letter-delete-btn" onclick="deleteSurveyItem(event,'surveyInbox','${escapeSurveyHtml(result.id)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`;
    }).join('');
}
window.viewSurveyItem = function(section, id) {
    const surveys = section === 'surveyOutbox' ? surveyData.surveyOutbox : surveyData.surveyInbox;
    const survey = surveys.find(s => s.id === id);
    if (!survey) return;
    editingSurveyId = id;
    editingSurveySection = section;
    document.getElementById('survey-view-title').textContent = '创建的问卷';
    document.getElementById('survey-view-title-text').textContent = survey.title;
    document.getElementById('survey-view-desc').textContent = survey.desc || '';
    let qHtml = '';
    survey.questions.forEach(q => {
        qHtml += `<div style="margin-bottom:12px;">
            <div style="font-weight:bold;margin-bottom:4px;">${escapeSurveyHtml(q.title)} <span style="opacity:0.7;font-size:12px;">${q.type==='radio'?'单选':'多选'}</span></div>`;
        q.options.forEach(opt=>{
            qHtml += `<div style="opacity:0.8">· ${escapeSurveyHtml(opt.label)}</div>`;
        })
        qHtml += `</div>`;
    })
    document.getElementById('survey-view-questions').innerHTML = qHtml;
    showModal(document.getElementById('survey-view-modal'));
}
window.viewSurveyResult = async function(section, id) {
    const results = surveyData.surveyInbox;
    const result = results.find(r => r.id === id);
    if (!result) return;
    if(result.isNew) {
        result.isNew = false;
        try {
            await saveSurveyData();
        } catch (error) {
            result.isNew = true;
            console.error('问卷已读状态保存失败:', error);
            showNotification('答卷状态保存失败，请重试', 'error');
            return;
        }
        renderSurveyLists();
    }
    editingSurveyId = id;
    editingSurveySection = section;
    document.getElementById('survey-view-title').textContent = '问卷答卷结果';
    document.getElementById('survey-view-title-text').textContent = result.originalTitle;
    let ansHtml = '';
    result.originalQuestions.forEach(q => {
        const selectedIds = result.answerData[q.id];
        const selectedLabels = q.options.filter(o=>selectedIds.includes(o.id)).map(o=>o.label);
        ansHtml += `<div style="margin-bottom:12px;">
            <div style="font-weight:bold;margin-bottom:4px;">${escapeSurveyHtml(q.title)} <span style="opacity:0.7;font-size:12px;">${q.type==='radio'?'单选':'多选'}</span></div>
            <div style="color:var(--accent-color)">✅ ${escapeSurveyHtml(selectedLabels.join("、"))}</div>
        </div>`;
    })
    document.getElementById('survey-view-questions').innerHTML = ansHtml;
    showModal(document.getElementById('survey-view-modal'));
}
window.closeSurveyViewModal = function() {
    hideModal(document.getElementById('survey-view-modal'));
}
window.deleteSurveyItem = async function(event, section, id) {
    event.stopPropagation();
    if (!confirm('确定删除这条问卷吗？')) return;
    const originalItems = section === 'surveyOutbox' ? surveyData.surveyOutbox : surveyData.surveyInbox;
    if (section === 'surveyOutbox') {
        surveyData.surveyOutbox = surveyData.surveyOutbox.filter(s => s.id !== id);
    } else {
        surveyData.surveyInbox = surveyData.surveyInbox.filter(s => s.id !== id);
    }
    try {
        await saveSurveyData();
    } catch (error) {
        if (section === 'surveyOutbox') surveyData.surveyOutbox = originalItems;
        else surveyData.surveyInbox = originalItems;
        console.error('问卷删除失败:', error);
        renderSurveyLists();
        showNotification('删除失败，请重试', 'error');
        return;
    }
    renderSurveyLists();
    showNotification('已删除', 'success');
}
window.openNewSurveyForm = function() {
    document.getElementById('survey-outbox-section').style.display = 'none';
    document.getElementById('survey-inbox-section').style.display = 'none';
    document.getElementById('survey-tab-bar').style.display = 'none';
    document.getElementById('survey-main-close-btn').style.display = 'none';
    document.getElementById('survey-compose-title').textContent = '创建限时问卷';
    // 清空表单
    document.getElementById('survey-title-input').value = '';
    document.getElementById('survey-desc-input').value = '';
    const duration = Math.min(24, Math.max(1, Number(settings.surveyReplyDelayHours) || 6));
    document.getElementById('survey-duration-display').textContent = `${duration}小时（在聊天设置 → 节奏中调整）`;
    document.getElementById('survey-question-list').innerHTML = '';
    document.getElementById('survey-compose-form').style.display = 'block';
}
window.cancelSurveyCompose = function() {
    document.getElementById('survey-compose-form').style.display = 'none';
    document.getElementById('survey-tab-bar').style.display = 'flex';
    document.getElementById('survey-main-close-btn').style.display = 'flex';
    if (currentSurveyTab === 'surveyOutbox') {
        document.getElementById('survey-outbox-section').style.display = 'block';
    } else {
        document.getElementById('survey-inbox-section').style.display = 'block';
    }
}
// 添加题目按钮
window.addSurveyQuestion = function() {
    const qListDom = document.getElementById('survey-question-list');
    const currentCount = qListDom.querySelectorAll(".survey-question-editor").length;
    if(currentCount >=5) {
        showNotification("最多只能添加5道题目", "warning");
        return;
    }
    const qId = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const qHtml = `
    <div class="survey-question-editor" data-qid="${qId}" style="border:1px solid var(--border-color);border-radius:12px;padding:12px;margin-bottom:10px;">
        <input type="text" placeholder="输入问题" style="width:100%;margin-bottom:8px;padding:6px;background:var(--primary-bg);border:1px solid var(--border-color);border-radius:8px;">
        <select class="q-type-select" style="margin-bottom:8px;padding:4px;background:var(--primary-bg);border:1px solid var(--border-color);border-radius:8px;">
            <option value="radio">单选</option>
            <option value="checkbox">多选</option>
        </select>
        <div class="opt-list"></div>
        <button type="button" onclick="addSurveyOption(this)" style="margin-top:6px;padding:4px 8px;">➕ 添加选项（多选最多5个）</button>
    </div>`;
    qListDom.insertAdjacentHTML("beforeend", qHtml);
}
window.addSurveyOption = function(btnEl) {
    const wrap = btnEl.closest(".survey-question-editor");
    const optList = wrap.querySelector(".opt-list");
    const optCount = optList.querySelectorAll(".opt-item").length;
    const qType = wrap.querySelector(".q-type-select").value;
    if(qType === "checkbox" && optCount >=5) {
        showNotification("多选题最多5个选项", "warning");
        return;
    }
    optList.insertAdjacentHTML("beforeend", `<div class="opt-item" style="display:flex;gap:6px;margin:4px 0;"><input placeholder="选项内容" style="flex:1;padding:4px;background:var(--primary-bg);border:1px solid var(--border-color);border-radius:6px;"><button onclick="this.closest('.opt-item').remove()" style="border:none;background:transparent;color:red;cursor:pointer;">×</button></div>`);
}
// 提交创建问卷
window.handleCreateSurvey = async function() {
    const title = document.getElementById('survey-title-input').value.trim();
    const desc = document.getElementById('survey-desc-input').value.trim();
    const duration = Math.min(24, Math.max(1, Number(settings.surveyReplyDelayHours) || 6));
    const qWrapList = document.querySelectorAll(".survey-question-editor");
    if(!title) { showNotification("问卷标题不能为空", "warning"); return; }
    const questions = [];
    for(const qWrap of qWrapList) {
        const qTitle = qWrap.querySelector("input").value.trim();
        const qType = qWrap.querySelector(".q-type-select").value;
        const optInputs = qWrap.querySelectorAll(".opt-item input");
        const options = [];
        for(const opt of optInputs) {
            const label = opt.value.trim();
            if(label) options.push({id:"opt_"+Date.now()+"_"+Math.random(), label});
        }
        if(!qTitle) { showNotification("问题不能为空", "warning"); return; }
        if(options.length ===0) { showNotification(`【${qTitle}】至少添加1个选项`, "warning"); return; }
        if(qType === "checkbox" && options.length>5) {
            showNotification(`【${qTitle}】多选题最多5个选项`, "warning"); return;
        }
        questions.push({
            id: qWrap.dataset.qid,
            title: qTitle,
            type: qType,
            options
        })
    }
    if(questions.length ===0) { showNotification("至少添加1道题目", "warning"); return; }
    const createTime = Date.now();
    const replyTime = createTime + duration * 60 * 60 * 1000;
    const newId = 'survey_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
    const newSurvey = {
        id: newId,
        title,
        desc,
        questions,
        createTime,
        replyTime,
        status: 'pending'
    };
    surveyData.surveyOutbox.push(newSurvey);
    try {
        await saveSurveyData();
    } catch (error) {
        surveyData.surveyOutbox = surveyData.surveyOutbox.filter(survey => survey.id !== newId);
        console.error('问卷创建失败:', error);
        showNotification('问卷保存失败，请重试', 'error');
        return;
    }
    cancelSurveyCompose();
    switchSurveyTab('surveyOutbox');
    showNotification(`问卷已创建，${duration}小时内自动完成答卷 📋`, 'success');
}

// ========== 模块初始化（页面加载完成自动运行） ==========
async function initSurveyModule() {
    await loadSurveyData();
    renderSurveyLists();
    await checkSurveyStatus();
    startSurveyTimer();
}
document.addEventListener('DOMContentLoaded', ()=>{
    initSurveyModule().catch(error => {
        console.error('问卷模块初始化失败:', error);
        showNotification('问卷数据加载失败，请刷新页面重试', 'error');
    });
})
