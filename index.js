import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'flower_pet';

// --- 数据定义 (无变化) ---
const seedPacks = {
    classic: { name: '经典花卉', stages: [{ threshold: 0, visual: '🌱', name: '种子' }, { threshold: 10, visual: '🌿', name: '幼苗' }, { threshold: 30, visual: '🍀', name: '三叶草' }, { threshold: 60, visual: '🌸', name: '小花' }, { threshold: 100, visual: '🌻', name: '向日葵' }, { threshold: 150, visual: '🌷', name: '郁金香' }, { threshold: 220, visual: '🌹', name: '玫瑰' }, { threshold: 300, visual: '🌺', name: '木槿' }] },
    vegetable: { name: '蔬菜园', stages: [{ threshold: 0, visual: '🥔', name: '土豆' }, { threshold: 10, visual: '🥕', name: '胡萝卜苗' }, { threshold: 30, visual: '🥬', name: '生菜' }, { threshold: 60, visual: '🥦', name: '西兰花' }, { threshold: 100, visual: '🌽', name: '玉米' }, { threshold: 150, visual: '🍆', name: '茄子' }, { threshold: 220, visual: '🍅', name: '西红柿' }, { threshold: 300, visual: '🎃', name: '大南瓜' }] },
    crystal: { name: '水晶矿脉', stages: [{ threshold: 0, visual: '🪨', name: '原石' }, { threshold: 15, visual: '⚪', name: '石英' }, { threshold: 40, visual: '🟣', name: '紫水晶' }, { threshold: 80, visual: '🟢', name: '翡翠' }, { threshold: 130, visual: '🔵', name: '蓝宝石' }, { threshold: 200, visual: '🔴', name: '红宝石' }, { threshold: 280, visual: '💎', name: '钻石' }, { threshold: 400, visual: '✨', name: '能量水晶簇' }] },
};
const COOLDOWNS = { WATER: 300000, FERTILIZE: 3600000 };
const REWARDS = { WATER: 2, FERTILIZE: 10, CATCH_BUG: 5 };
const defaultSettings = { enabled: true, growthPoints: 0, seedPack: 'classic', hasBug: false, lastWatered: 0, lastFertilized: 0 };

// --- 新增: UI状态变量 ---
let isMobileExpanded = false; // 用于跟踪移动端悬浮球是否已展开

// --- 功能函数 ---

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

function createPetUI() {
    if (document.getElementById('flower-pet-container')) return;

    const container = document.createElement('div');
    container.id = 'flower-pet-container';

    // *** 新增: 点击事件处理移动端展开/折叠 ***
    container.addEventListener('click', () => {
        if (container.classList.contains('flower-pet-mobile')) {
            // 只有在移动视图下，这个点击才用于展开/折叠
            isMobileExpanded = !isMobileExpanded;
            container.classList.toggle('flower-pet-expanded', isMobileExpanded);
        }
    });

    const actions = document.createElement('div');
    actions.id = 'flower-pet-actions';
    actions.innerHTML = `
        <div id="flower-action-water" class="flower-action-button fa-solid fa-tint" title="浇水 (+${REWARDS.WATER} 点)"></div>
        <div id="flower-action-fertilize" class="flower-action-button fa-solid fa-leaf" title="施肥 (+${REWARDS.FERTILIZE} 点)"></div>
        <div id="flower-action-bug" class="flower-action-button fa-solid fa-bug" title="捉虫 (+${REWARDS.CATCH_BUG} 点)"></div>
    `;

    const stageDisplay = document.createElement('div');
    stageDisplay.id = 'flower-pet-stage';
    stageDisplay.title = t`Your little flower that grows as you chat.`;

    const pointsDisplay = document.createElement('div');
    pointsDisplay.id = 'flower-pet-points';

    container.append(actions, stageDisplay, pointsDisplay);
    document.body.append(container);

    // 绑定具体的动作事件，并阻止事件冒泡到容器
    document.getElementById('flower-action-water').addEventListener('click', (e) => { e.stopPropagation(); handleWatering(); });
    document.getElementById('flower-action-fertilize').addEventListener('click', (e) => { e.stopPropagation(); handleFertilizing(); });
    document.getElementById('flower-action-bug').addEventListener('click', (e) => { e.stopPropagation(); handleCatchBug(); });
}

function updatePetUI() {
    const settings = getSettings();
    const container = document.getElementById('flower-pet-container');
    if (!container) return;

    container.style.display = settings.enabled ? 'flex' : 'none';
    if (!settings.enabled) return;

    const currentPack = seedPacks[settings.seedPack] || seedPacks.classic;
    let currentStage = currentPack.stages[0];
    for (let i = currentPack.stages.length - 1; i >= 0; i--) {
        if (settings.growthPoints >= currentPack.stages[i].threshold) {
            currentStage = currentPack.stages[i];
            break;
        }
    }
    const stageDisplay = document.getElementById('flower-pet-stage');
    // **修改: 悬浮球的图标就是植物形态，有虫子时加在旁边
    stageDisplay.textContent = currentStage.visual + (settings.hasBug ? '🐛' : '');
    container.title = `${currentStage.name} - ${t`Your little flower that grows as you chat.`}`;

    document.getElementById('flower-pet-points').textContent = `${t`Growth Points:`} ${settings.growthPoints}`;

    const now = Date.now();
    const waterButton = document.getElementById('flower-action-water');
    const fertilizeButton = document.getElementById('flower-action-fertilize');
    const bugButton = document.getElementById('flower-action-bug');
    waterButton.classList.toggle('disabled', now - settings.lastWatered < COOLDOWNS.WATER);
    fertilizeButton.classList.toggle('disabled', now - settings.lastFertilized < COOLDOWNS.FERTILIZE);
    bugButton.style.display = settings.hasBug ? 'block' : 'none';
}

function handleWatering() { /* ...无变化... */
    const settings = getSettings();
    if (Date.now() - settings.lastWatered < COOLDOWNS.WATER) return;
    settings.lastWatered = Date.now();
    settings.growthPoints += REWARDS.WATER;
    showFeedback(`+${REWARDS.WATER}`);
    saveSettingsDebounced();
    updatePetUI();
}
function handleFertilizing() { /* ...无变化... */
    const settings = getSettings();
    if (Date.now() - settings.lastFertilized < COOLDOWNS.FERTILIZE) return;
    settings.lastFertilized = Date.now();
    settings.growthPoints += REWARDS.FERTILIZE;
    showFeedback(`+${REWARDS.FERTILIZE}`);
    saveSettingsDebounced();
    updatePetUI();
}
function handleCatchBug() { /* ...无变化... */
    const settings = getSettings();
    if (!settings.hasBug) return;
    settings.hasBug = false;
    settings.growthPoints += REWARDS.CATCH_BUG;
    showFeedback(`+${REWARDS.CATCH_BUG}`);
    saveSettingsDebounced();
    updatePetUI();
}
function incrementGrowth() { /* ...无变化... */
    const settings = getSettings();
    if (!settings.enabled) return;
    settings.growthPoints++;
    if (!settings.hasBug && Math.random() < 0.15) {
        settings.hasBug = true;
    }
    saveSettingsDebounced();
    updatePetUI();
}

function checkMobileView() {
    const container = document.getElementById('flower-pet-container');
    if (!container) return;
    if (window.innerWidth < 768) {
        container.classList.add('flower-pet-mobile');
    } else {
        container.classList.remove('flower-pet-mobile');
        // *** 新增: 从移动端切换回桌面端时，强制取消展开状态 ***
        isMobileExpanded = false;
        container.classList.remove('flower-pet-expanded');
    }
}

function showFeedback(text) { /* ...无变化... */
    const container = document.getElementById('flower-pet-container');
    if (!container) return;
    const feedback = document.createElement('div');
    feedback.className = 'flower-feedback';
    feedback.textContent = text;
    container.appendChild(feedback);
    setTimeout(() => feedback.remove(), 1000);
}

// *** 新增: 处理点击外部区域关闭悬浮球的逻辑 ***
function handleOutsideClick(event) {
    const container = document.getElementById('flower-pet-container');
    if (isMobileExpanded && container && !container.contains(event.target)) {
        isMobileExpanded = false;
        container.classList.remove('flower-pet-expanded');
    }
}

function addExtensionSettings(settings) { /* ...无变化, 代码省略以保持简洁... */
    const settingsContainer = document.getElementById('extensions_settings');
    if (!settingsContainer) return;
    let seedOptions = '';
    for (const key in seedPacks) {
        seedOptions += `<option value="${key}" ${settings.seedPack === key ? 'selected' : ''}>${seedPacks[key].name}</option>`;
    }
    const container = document.createElement('div');
    container.innerHTML = `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>${t`Desktop Flower Pet`}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><label class="checkbox_label"><input id="flowerPetEnabled" type="checkbox" /><span>${t`Enabled`}</span></label><div class="settings_block"><label for="flowerPetSeedPack">更换种子:</label><select id="flowerPetSeedPack" class="text_pole">${seedOptions}</select></div><div class="flex-container"><button id="flowerPetReset" class="menu_button fa-solid fa-undo" title="Reset all growth points to 0"></button><label for="flowerPetReset" class="button_label">${t`Reset Growth`}</label></div></div></div>`;
    settingsContainer.append(container);
    const enabledCheckbox = container.querySelector('#flowerPetEnabled');
    enabledCheckbox.checked = settings.enabled;
    enabledCheckbox.addEventListener('change', () => { settings.enabled = enabledCheckbox.checked; saveSettingsDebounced(); updatePetUI(); });
    const seedSelector = container.querySelector('#flowerPetSeedPack');
    seedSelector.addEventListener('change', (event) => { settings.seedPack = event.target.value; saveSettingsDebounced(); updatePetUI(); });
    const resetButton = container.querySelector('#flowerPetReset');
    resetButton.addEventListener('click', () => { if (confirm('Are you sure you want to reset your flower\'s growth? This will reset points and interactions.')) { settings.growthPoints = 0; settings.hasBug = false; settings.lastWatered = 0; settings.lastFertilized = 0; saveSettingsDebounced(); updatePetUI(); } });
}

// --- 主逻辑入口 ---
(function () {
    const settings = getSettings();
    addExtensionSettings(settings);
    createPetUI();
    updatePetUI();
    checkMobileView();

    const growthEvents = [event_types.MESSAGE_SENT, event_types.MESSAGE_RECEIVED];
    growthEvents.forEach(e => eventSource.on(e, incrementGrowth));
    eventSource.on(event_types.CHAT_CHANGED, updatePetUI);
    window.addEventListener('resize', checkMobileView);
    // *** 新增: 添加全局点击事件监听器 ***
    document.addEventListener('click', handleOutsideClick, true); // 使用捕获阶段确保能响应
})();