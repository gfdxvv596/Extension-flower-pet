import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'flower_pet';

// --- 数据定义 ---

// 将“种子”定义为数据包，方便扩展
const seedPacks = {
    classic: {
        name: '经典花卉',
        stages: [
            { threshold: 0,    visual: '🌱', name: '种子' },
            { threshold: 10,   visual: '🌿', name: '幼苗' },
            { threshold: 30,   visual: '🍀', name: '三叶草' },
            { threshold: 60,   visual: '🌸', name: '小花' },
            { threshold: 100,  visual: '🌻', name: '向日葵' },
            { threshold: 150,  visual: '🌷', name: '郁金香' },
            { threshold: 220,  visual: '🌹', name: '玫瑰' },
            { threshold: 300,  visual: '🌺', name: '木槿' },
        ],
    },
    vegetable: {
        name: '蔬菜园',
        stages: [
            { threshold: 0,    visual: '🥔', name: '土豆' },
            { threshold: 10,   visual: '🥕', name: '胡萝卜苗' },
            { threshold: 30,   visual: '🥬', name: '生菜' },
            { threshold: 60,   visual: '🥦', name: '西兰花' },
            { threshold: 100,  visual: '🌽', name: '玉米' },
            { threshold: 150,  visual: '🍆', name: '茄子' },
            { threshold: 220,  visual: '🍅', name: '西红柿' },
            { threshold: 300,  visual: '🎃', name: '大南瓜' },
        ],
    },
    crystal: {
        name: '水晶矿脉',
        stages: [
            { threshold: 0,    visual: '🪨', name: '原石' },
            { threshold: 15,   visual: '⚪', name: '石英' },
            { threshold: 40,   visual: '🟣', name: '紫水晶' },
            { threshold: 80,   visual: '🟢', name: '翡翠' },
            { threshold: 130,  visual: '🔵', name: '蓝宝石' },
            { threshold: 200,  visual: '🔴', name: '红宝石' },
            { threshold: 280,  visual: '💎', name: '钻石' },
            { threshold: 400,  visual: '✨', name: '能量水晶簇' },
        ],
    },
};

// 定义动作的冷却时间 (毫秒)
const COOLDOWNS = {
    WATER: 5 * 60 * 1000,      // 5 分钟
    FERTILIZE: 60 * 60 * 1000, // 1 小时
};

// 定义动作的奖励
const REWARDS = {
    WATER: 2,
    FERTILIZE: 10,
    CATCH_BUG: 5,
};

/** @type {import('../../../../../script').SillyTavernExtensionSettings} */
const defaultSettings = {
    enabled: true,
    growthPoints: 0,
    seedPack: 'classic', // 默认种子包
    hasBug: false,
    lastWatered: 0,      // 上次浇水时间戳
    lastFertilized: 0,   // 上次施肥时间戳
};

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

/**
 * 核心UI创建函数
 */
function createPetUI() {
    if (document.getElementById('flower-pet-container')) return;

    const container = document.createElement('div');
    container.id = 'flower-pet-container';

    // 交互按钮区域
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

    // 绑定事件
    document.getElementById('flower-action-water').addEventListener('click', handleWatering);
    document.getElementById('flower-action-fertilize').addEventListener('click', handleFertilizing);
    document.getElementById('flower-action-bug').addEventListener('click', handleCatchBug);
}

/**
 * 核心UI更新函数
 */
function updatePetUI() {
    const settings = getSettings();
    const container = document.getElementById('flower-pet-container');
    if (!container) return;

    // 控制整体显示/隐藏
    container.style.display = settings.enabled ? 'flex' : 'none';
    if (!settings.enabled) return;

    // 1. 更新植物形态
    const currentPack = seedPacks[settings.seedPack] || seedPacks.classic;
    let currentStage = currentPack.stages[0];
    for (let i = currentPack.stages.length - 1; i >= 0; i--) {
        if (settings.growthPoints >= currentPack.stages[i].threshold) {
            currentStage = currentPack.stages[i];
            break;
        }
    }
    const stageDisplay = document.getElementById('flower-pet-stage');
    // 如果有虫子，在植物旁边显示虫子图标
    stageDisplay.textContent = currentStage.visual + (settings.hasBug ? '🐛' : '');
    container.title = `${currentStage.name} - ${t`Your little flower that grows as you chat.`}`;

    // 2. 更新成长点数
    document.getElementById('flower-pet-points').textContent = `${t`Growth Points:`} ${settings.growthPoints}`;

    // 3. 更新交互按钮状态
    const now = Date.now();
    const waterButton = document.getElementById('flower-action-water');
    const fertilizeButton = document.getElementById('flower-action-fertilize');
    const bugButton = document.getElementById('flower-action-bug');

    waterButton.classList.toggle('disabled', now - settings.lastWatered < COOLDOWNS.WATER);
    fertilizeButton.classList.toggle('disabled', now - settings.lastFertilized < COOLDOWNS.FERTILIZE);
    bugButton.style.display = settings.hasBug ? 'block' : 'none';
}

/**
 * 处理浇水动作
 */
function handleWatering() {
    const settings = getSettings();
    if (Date.now() - settings.lastWatered < COOLDOWNS.WATER) return; // 检查冷却
    
    settings.lastWatered = Date.now();
    settings.growthPoints += REWARDS.WATER;
    
    showFeedback(`+${REWARDS.WATER}`);
    saveSettingsDebounced();
    updatePetUI();
}

/**
 * 处理施肥动作
 */
function handleFertilizing() {
    const settings = getSettings();
    if (Date.now() - settings.lastFertilized < COOLDOWNS.FERTILIZE) return; // 检查冷却

    settings.lastFertilized = Date.now();
    settings.growthPoints += REWARDS.FERTILIZE;

    showFeedback(`+${REWARDS.FERTILIZE}`);
    saveSettingsDebounced();
    updatePetUI();
}

/**
 * 处理捉虫动作
 */
function handleCatchBug() {
    const settings = getSettings();
    if (!settings.hasBug) return;

    settings.hasBug = false;
    settings.growthPoints += REWARDS.CATCH_BUG;
    
    showFeedback(`+${REWARDS.CATCH_BUG}`);
    saveSettingsDebounced();
    updatePetUI();
}

/**
 * 增加成长点数并概率性触发虫子事件
 */
function incrementGrowth() {
    const settings = getSettings();
    if (!settings.enabled) return;

    settings.growthPoints++;

    // 每次聊天有 15% 的几率出现虫子 (如果没有虫子的话)
    if (!settings.hasBug && Math.random() < 0.15) {
        settings.hasBug = true;
    }

    saveSettingsDebounced();
    updatePetUI();
}

/**
 * 适配移动端视图
 */
function checkMobileView() {
    const container = document.getElementById('flower-pet-container');
    if (!container) return;
    // 当窗口宽度小于768px时，认为是移动端
    if (window.innerWidth < 768) {
        container.classList.add('flower-pet-mobile');
    } else {
        container.classList.remove('flower-pet-mobile');
    }
}

/**
 * 显示一个短暂的反馈动画 (例如 "+2")
 * @param {string} text 
 */
function showFeedback(text) {
    const container = document.getElementById('flower-pet-container');
    if (!container) return;
    
    const feedback = document.createElement('div');
    feedback.className = 'flower-feedback';
    feedback.textContent = text;
    container.appendChild(feedback);

    setTimeout(() => feedback.remove(), 1000); // 1秒后移除
}


/**
 * 创建扩展设置UI
 */
function addExtensionSettings(settings) {
    const settingsContainer = document.getElementById('extensions_settings');
    if (!settingsContainer) return;

    // 创建种子选择器的选项
    let seedOptions = '';
    for (const key in seedPacks) {
        seedOptions += `<option value="${key}" ${settings.seedPack === key ? 'selected' : ''}>${seedPacks[key].name}</option>`;
    }

    const container = document.createElement('div');
    container.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${t`Desktop Flower Pet`}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input id="flowerPetEnabled" type="checkbox" />
                    <span>${t`Enabled`}</span>
                </label>
                
                <div class="settings_block">
                    <label for="flowerPetSeedPack">更换种子:</label>
                    <select id="flowerPetSeedPack" class="text_pole">
                        ${seedOptions}
                    </select>
                </div>

                <div class="flex-container">
                    <button id="flowerPetReset" class="menu_button fa-solid fa-undo" title="Reset all growth points to 0"></button>
                    <label for="flowerPetReset" class="button_label">${t`Reset Growth`}</label>
                </div>
            </div>
        </div>
    `;

    settingsContainer.append(container);

    // 绑定设置事件
    const enabledCheckbox = container.querySelector('#flowerPetEnabled');
    enabledCheckbox.checked = settings.enabled;
    enabledCheckbox.addEventListener('change', () => {
        settings.enabled = enabledCheckbox.checked;
        saveSettingsDebounced();
        updatePetUI();
    });

    const seedSelector = container.querySelector('#flowerPetSeedPack');
    seedSelector.addEventListener('change', (event) => {
        settings.seedPack = event.target.value;
        saveSettingsDebounced();
        updatePetUI(); // 立即更新UI以显示新种子
    });

    const resetButton = container.querySelector('#flowerPetReset');
    resetButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset your flower\'s growth? This will reset points and interactions.')) {
            // 重置所有相关设置
            settings.growthPoints = 0;
            settings.hasBug = false;
            settings.lastWatered = 0;
            settings.lastFertilized = 0;
            saveSettingsDebounced();
            updatePetUI();
        }
    });
}

// --- 主逻辑入口 ---
(function () {
    const settings = getSettings();
    addExtensionSettings(settings);
    createPetUI();
    updatePetUI();
    checkMobileView(); // 初始加载时检查一次

    // 监听事件
    const growthEvents = [event_types.MESSAGE_SENT, event_types.MESSAGE_RECEIVED];
    growthEvents.forEach(e => eventSource.on(e, incrementGrowth));
    
    eventSource.on(event_types.CHAT_CHANGED, updatePetUI);
    window.addEventListener('resize', checkMobileView); // 监听窗口大小变化
})();