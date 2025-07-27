// index.js (v2.1 - 修复移动端切换Bug)
import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    ui, // 新增导入 ui 对象
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'flower_pet';

// --- 配置项 (保持不变) ---
const COOLDOWNS = {
    WATER: 30 * 60 * 1000,
    FERTILIZE: 4 * 60 * 60 * 1000,
};
const REWARDS = {
    CHAT: 1,
    WATER: 10,
    FERTILIZE: 50,
    DEBUG: 25,
};
const PEST_CHANCE = 0.05;
const PEST_CHECK_INTERVAL = 5 * 60 * 1000;
const SEED_CATALOGUE = {
    default_flower: {
        name: '太阳花',
        stages: [
            { threshold: 0, visual: '🌱', name: '种子' },
            { threshold: 10, visual: '🌿', name: '幼苗' },
            { threshold: 30, visual: '🍀', name: '三叶草' },
            { threshold: 60, visual: '🌸', name: '小花' },
            { threshold: 100, visual: '🌻', name: '向日葵' },
        ],
    },
    rose_bush: {
        name: '玫瑰丛',
        stages: [
            { threshold: 0, visual: '🪴', name: '花盆' },
            { threshold: 20, visual: '🌿', name: '新芽' },
            { threshold: 50, visual: '🍃', name: '绿叶' },
            { threshold: 90, visual: '🌹', name: '玫瑰' },
            { threshold: 150, visual: '🥀', name: '盛开的玫瑰' },
        ],
    },
    magic_tree: {
        name: '魔法树',
        stages: [
            { threshold: 0, visual: '🌰', name: '魔力坚果' },
            { threshold: 50, visual: '🌳', name: '小树苗' },
            { threshold: 150, visual: '🌲', name: '成长中的树' },
            { threshold: 300, visual: '✨', name: '闪光' },
            { threshold: 500, visual: '🌟', name: '星之树' },
        ],
    },
};
const defaultSettings = {
    enabled: true,
    growthPoints: 0,
    currentSeedType: 'default_flower',
    hasPest: false,
    lastWatered: 0,
    lastFertilized: 0,
    position: { x: 20, y: 20 },
};

function getSettings() {
    if (extension_settings[MODULE] === undefined) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    for (const key in defaultSettings) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE];
}

// --- UI 创建和管理 (保持不变) ---
function createPetUI() {
    if (document.getElementById('flower-pet-container')) return;
    const container = document.createElement('div');
    container.id = 'flower-pet-container';
    container.innerHTML = `
        <div class="pet-body">
            <div id="flower-pet-stage"></div>
            <div class="pest-overlay">🐛</div>
            <div class="pet-controls">
                <button id="flower-pet-water" class="pet-action-button" title="浇水"><i class="fa-solid fa-tint"></i></button>
                <button id="flower-pet-fertilize" class="pet-action-button" title="施肥"><i class="fa-solid fa-seedling"></i></button>
                <button id="flower-pet-debug" class="pet-action-button" title="捉虫"><i class="fa-solid fa-bug-slash"></i></button>
                <button id="flower-pet-change-seed" class="pet-action-button" title="换种子"><i class="fa-solid fa-recycle"></i></button>
            </div>
        </div>
        <div class="pet-info-panel">
             <span id="flower-pet-name"></span>: <span id="flower-pet-points"></span>
        </div>
    `;
    document.body.append(container);
    const body = container.querySelector('.pet-body');
    body.addEventListener('click', (e) => {
        if (container.classList.contains('dragging-check')) {
            container.classList.remove('dragging-check'); return;
        }
        e.stopPropagation(); container.classList.toggle('expanded');
    });
    document.getElementById('flower-pet-water').addEventListener('click', handleWater);
    document.getElementById('flower-pet-fertilize').addEventListener('click', handleFertilize);
    document.getElementById('flower-pet-debug').addEventListener('click', handleDebug);
    document.getElementById('flower-pet-change-seed').addEventListener('click', showSeedSelection);
    makeDraggable(container);
}

function updatePetUI() {
    const settings = getSettings();
    const container = document.getElementById('flower-pet-container');
    if (!container) return;
    container.style.display = settings.enabled ? 'block' : 'none';
    if (!settings.enabled) return;
    container.style.right = `${settings.position.x}px`;
    container.style.bottom = `${settings.position.y}px`;
    container.style.left = 'auto';
    container.style.top = 'auto';
    const seed = SEED_CATALOGUE[settings.currentSeedType] || SEED_CATALOGUE.default_flower;
    let currentStage = seed.stages[0];
    for (let i = seed.stages.length - 1; i >= 0; i--) {
        if (settings.growthPoints >= seed.stages[i].threshold) {
            currentStage = seed.stages[i]; break;
        }
    }
    document.getElementById('flower-pet-stage').textContent = currentStage.visual;
    document.getElementById('flower-pet-name').textContent = currentStage.name;
    document.getElementById('flower-pet-points').textContent = settings.growthPoints;
    document.querySelector('.pest-overlay').style.display = settings.hasPest ? 'flex' : 'none';
    const now = Date.now();
    const waterButton = document.getElementById('flower-pet-water');
    const fertilizeButton = document.getElementById('flower-pet-fertilize');
    const debugButton = document.getElementById('flower-pet-debug');
    waterButton.disabled = (now - settings.lastWatered < COOLDOWNS.WATER);
    fertilizeButton.disabled = (now - settings.lastFertilized < COOLDOWNS.FERTILIZE);
    debugButton.style.display = settings.hasPest ? 'flex' : 'none';
    waterButton.style.display = fertilizeButton.style.display = settings.hasPest ? 'none' : 'flex';
    document.getElementById('flower-pet-change-seed').style.display = settings.hasPest ? 'none' : 'flex';
    if (waterButton.disabled) waterButton.title = `浇水 (冷却中: ${Math.ceil((COOLDOWNS.WATER - (now - settings.lastWatered)) / 60000)}m)`;
    else waterButton.title = '浇水';
}

// --- 交互逻辑、随机事件、拖动逻辑、辅助函数 (全部保持不变) ---
function addGrowthPoints(amount, sourceIcon) { const settings = getSettings(); settings.growthPoints += amount; showFeedbackAnimation(sourceIcon || `+${amount}`); updatePetUI(); saveSettingsDebounced(); }
function handleWater(e) { e.stopPropagation(); addGrowthPoints(REWARDS.WATER, '💧'); getSettings().lastWatered = Date.now(); updatePetUI(); }
function handleFertilize(e) { e.stopPropagation(); addGrowthPoints(REWARDS.FERTILIZE, '✨'); getSettings().lastFertilized = Date.now(); updatePetUI(); }
function handleDebug(e) { e.stopPropagation(); const settings = getSettings(); if (!settings.hasPest) return; settings.hasPest = false; addGrowthPoints(REWARDS.DEBUG, '✅'); }
function randomPestEvent() { const settings = getSettings(); if (!settings.enabled || settings.hasPest) return; if (Math.random() < PEST_CHANCE) { settings.hasPest = true; showFeedbackAnimation('🐛!'); updatePetUI(); saveSettingsDebounced(); } }
function makeDraggable(element) { let isDragging = false; let offsetX, offsetY; function onMouseDown(e) { isDragging = true; element.classList.add('dragging'); element.classList.add('dragging-check'); setTimeout(() => element.classList.remove('dragging-check'), 200); const rect = element.getBoundingClientRect(); offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); } function onMouseMove(e) { if (!isDragging) return; let newX = window.innerWidth - (e.clientX - offsetX + element.offsetWidth); let newY = window.innerHeight - (e.clientY - offsetY + element.offsetHeight); newX = Math.max(0, Math.min(newX, window.innerWidth - element.offsetWidth)); newY = Math.max(0, Math.min(newY, window.innerHeight - element.offsetHeight)); element.style.right = `${newX}px`; element.style.bottom = `${newY}px`; } function onMouseUp(e) { isDragging = false; element.classList.remove('dragging'); const settings = getSettings(); settings.position.x = parseInt(element.style.right); settings.position.y = parseInt(element.style.bottom); saveSettingsDebounced(); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); } element.addEventListener('mousedown', onMouseDown); }
function showFeedbackAnimation(content) { const container = document.getElementById('flower-pet-container'); if (!container) return; const feedback = document.createElement('div'); feedback.className = 'feedback-animation'; feedback.innerHTML = content; container.appendChild(feedback); setTimeout(() => feedback.remove(), 1000); }
function showSeedSelection(e) { e.stopPropagation(); document.getElementById('flower-pet-container').classList.remove('expanded'); const backdrop = document.createElement('div'); backdrop.className = 'seed-modal-backdrop'; backdrop.addEventListener('click', () => backdrop.remove()); const modal = document.createElement('div'); modal.className = 'seed-modal-content'; modal.addEventListener('click', (ev) => ev.stopPropagation()); modal.innerHTML = `<h3>选择新的种子</h3><p>选择一个新的植物开始培养。注意：这将会重置你当前的成长点数。</p><div class="seed-selection"></div>`; const selectionContainer = modal.querySelector('.seed-selection'); for (const [seedId, seedData] of Object.entries(SEED_CATALOGUE)) { const option = document.createElement('div'); option.className = 'seed-option'; option.innerHTML = `<div class="emoji">${seedData.stages[seedData.stages.length-1].visual}</div><div class="name">${seedData.name}</div>`; option.addEventListener('click', () => { if (confirm(`确定要切换到 "${seedData.name}" 吗？当前进度将清零。`)) { const settings = getSettings(); settings.currentSeedType = seedId; settings.growthPoints = 0; settings.hasPest = false; updatePetUI(); saveSettingsDebounced(); backdrop.remove(); } }); selectionContainer.appendChild(option); } backdrop.appendChild(modal); document.body.appendChild(backdrop); }

// =================================================================
// ===== 关键修复区域 START =====
// =================================================================

/**
 * @name ensurePetUIExists
 * @description 这是一个“守护”函数。它确保宠物的UI元素始终存在于页面上。
 * 如果UI元素不存在（例如，在视图切换后被移除），它会重新创建UI。
 * 然后，它总是会更新UI以反映最新的状态。
 */
function ensurePetUIExists() {
    if (!document.getElementById('flower-pet-container')) {
        // 如果悬浮球不见了，就重新创建它
        createPetUI();
    }
    // 无论如何，都更新一次UI（以应用位置、状态等）
    updatePetUI();
}


// --- 初始化 ---
(function () {
    // 扩展设置菜单部分可以保持和之前类似
    // (此处省略了 addExtensionSettings 的代码，可以复用)

    // 首次加载时，确保UI存在
    ensurePetUIExists();

    // 监听被动成长事件
    eventSource.on(event_types.MESSAGE_SENT, () => addGrowthPoints(REWARDS.CHAT));
    eventSource.on(event_types.MESSAGE_RECEIVED, () => addGrowthPoints(REWARDS.CHAT));
    
    // 定时检查害虫
    setInterval(randomPestEvent, PEST_CHECK_INTERVAL);

    // 窗口大小改变时重新检查边界
    window.addEventListener('resize', updatePetUI);

    // 【重要修复】监听SillyTavern的UI更新事件
    // 每当UI发生重大变化（包括切换到移动视图），就调用我们的守护函数
    eventSource.on(event_types.UI_UPDATED, ensurePetUIExists);
    
    // 为保险起见，也在聊天切换时检查
    eventSource.on(event_types.CHAT_CHANGED, ensurePetUIExists);
})();

// =================================================================
// ===== 关键修复区域 END =====
// =================================================================