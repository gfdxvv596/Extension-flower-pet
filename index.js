import {
    name2, // 导入角色名
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'flower_pet';

// --- 配置和常量 ---
const LONG_PRESS_DURATION = 300;
const WATER_COOLDOWN = 15 * 60 * 1000; // 15分钟
const FERTILIZE_COOLDOWN = 15 * 60 * 1000; // 15分钟
const BUG_CHANCE = 0.05;

const SEED_SERIES = {
    flowers: { name: t`Flower Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍀' }, { threshold: 60, visual: '🌸' }, { threshold: 100, visual: '🌻' }, { threshold: 150, visual: '🌷' }, { threshold: 220, visual: '🌹' }, { threshold: 300, visual: '🌺' }, ], },
    vegetables: { name: t`Vegetable Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🥬' }, { threshold: 60, visual: '🥦' }, { threshold: 100, visual: '🥕' }, { threshold: 150, visual: '🌽' }, { threshold: 220, visual: '🍅' }, { threshold: 300, visual: '🍆' }, ], },
    fruits: { name: t`Fruit Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍇' }, { threshold: 60, visual: '🍓' }, { threshold: 100, visual: '🍉' }, { threshold: 150, visual: '🍍' }, { threshold: 220, visual: '🍎' }, { threshold: 300, visual: '🍑' }, ], },
};

const defaultSettings = {
    enabled: true,
    growthPoints: 0,
    seedType: 'flowers',
    coParent: false,
    hasBug: false,
    lastWatered: 0,
    lastFertilized: 0,
    position: { top: null, left: null },
};

// --- 状态和DOM引用 ---
let isDragging = false, pressTimer = null, offsetX, offsetY;
let petContainer, stageDisplay, bugDisplay, progressFill, actionsContainer;
let waterButton, fertilizeButton, bugButton;

// --- 核心函数 ---

function getSettings() {
    if (extension_settings[MODULE] === undefined) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    Object.assign(extension_settings[MODULE], { ...defaultSettings, ...extension_settings[MODULE] });
    return extension_settings[MODULE];
}

function handlePressStart(e) { e.preventDefault(); clearTimeout(pressTimer); pressTimer = setTimeout(() => { isDragging = true; const petRect = petContainer.getBoundingClientRect(); const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX; const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY; offsetX = clientX - petRect.left; offsetY = clientY - petRect.top; petContainer.style.cursor = 'grabbing'; }, LONG_PRESS_DURATION); }
function handlePressMove(e) { if (!isDragging) return; e.preventDefault(); const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX; const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY; let newLeft = clientX - offsetX; let newTop = clientY - offsetY; const maxLeft = window.innerWidth - petContainer.offsetWidth; const maxTop = window.innerHeight - petContainer.offsetHeight; newLeft = Math.max(0, Math.min(newLeft, maxLeft)); newTop = Math.max(0, Math.min(newTop, maxTop)); petContainer.style.left = `${newLeft}px`; petContainer.style.top = `${newTop}px`; }
function handlePressEnd() { clearTimeout(pressTimer); if (isDragging) { isDragging = false; petContainer.style.cursor = 'grab'; const settings = getSettings(); settings.position.left = parseInt(petContainer.style.left, 10); settings.position.top = parseInt(petContainer.style.top, 10); saveSettingsDebounced(); } else { toggleActionsMenu(); } }
function toggleActionsMenu() { actionsContainer.classList.toggle('visible'); }
function showFloatingAnimation(text) { const animation = document.createElement('div'); animation.className = 'floating-animation'; animation.textContent = text; petContainer.appendChild(animation); setTimeout(() => animation.remove(), 1500); }

function waterPlant() {
    const settings = getSettings();
    const now = Date.now();
    if ((now - settings.lastWatered) < WATER_COOLDOWN) {
        showFloatingAnimation(`🚫 ${t`On Cooldown`}`);
    } else {
        settings.lastWatered = now;
        addGrowthPoints(5, 'water');
    }
}

function fertilizePlant() {
    const settings = getSettings();
    const now = Date.now();
    if ((now - settings.lastFertilized) < FERTILIZE_COOLDOWN) {
        showFloatingAnimation(`🚫 ${t`On Cooldown`}`);
    } else {
        settings.lastFertilized = now;
        addGrowthPoints(5, 'fertilize');
    }
}

function catchBug() { const settings = getSettings(); settings.hasBug = false; addGrowthPoints(20, 'bug'); }

function addGrowthPoints(points, reason = 'chat') {
    const settings = getSettings();
    if (!settings.enabled || settings.hasBug) return;
    settings.growthPoints += points;
    updatePetUI();
    updateSettingsUI();
    saveSettingsDebounced();
    let icon = reason === 'water' ? '💧' : reason === 'fertilize' ? '✨' : reason === 'bug' ? '✔️' : '💬';
    showFloatingAnimation(`+${points} ${icon}`);
}

function resetPlant() {
    if (!confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) return;
    const settings = getSettings();
    settings.growthPoints = 0;
    settings.hasBug = false;
    settings.lastWatered = 0;
    settings.lastFertilized = 0;
    saveSettingsDebounced();
    updatePetUI();
    updateSettingsUI();
}

function updateSettingsUI() {
    const settings = getSettings();
    const statusStage = document.getElementById('flower-pet-status-stage');
    const statusGrowth = document.getElementById('flower-pet-status-growth');
    if (!statusStage || !statusGrowth) return;
    const series = SEED_SERIES[settings.seedType] || SEED_SERIES.flowers;
    let currentStage = series.stages[0];
    for (let i = series.stages.length - 1; i >= 0; i--) { if (settings.growthPoints >= series.stages[i].threshold) { currentStage = series.stages[i]; break; } }
    statusStage.textContent = `${currentStage.visual} (${series.stages.indexOf(currentStage) + 1} / ${series.stages.length})`;
    statusGrowth.textContent = `${settings.growthPoints}`;
}

function addExtensionSettings(settings) {
    const settingsContainer = document.getElementById('extensions_settings');
    if (!settingsContainer) return;
    const inlineDrawer = document.createElement('div');
    inlineDrawer.classList.add('inline-drawer');
    const inlineDrawerToggle = document.createElement('div');
    inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header');
    inlineDrawerToggle.innerHTML = `<b>${t`Desktop Flower Pet`}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>`;
    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');
    inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent);
    const enabledLabel = document.createElement('label');
    enabledLabel.classList.add('checkbox_label');
    enabledLabel.innerHTML = `<input id="flowerPetEnabled" type="checkbox"><span>${t`Enabled`}</span>`;
    const enabledCheckbox = enabledLabel.querySelector('#flowerPetEnabled');
    enabledCheckbox.checked = settings.enabled;
    enabledCheckbox.addEventListener('change', () => { settings.enabled = enabledCheckbox.checked; saveSettingsDebounced(); updatePetUI(); });
    const coParentLabel = document.createElement('label');
    coParentLabel.classList.add('checkbox_label');
    coParentLabel.innerHTML = `<input id="flowerPetCoParent" type="checkbox"><span>${t`Nurture with {name2}`.replace('{name2}', name2)}</span>`;
    const coParentCheckbox = coParentLabel.querySelector('#flowerPetCoParent');
    coParentCheckbox.checked = settings.coParent;
    coParentCheckbox.addEventListener('change', () => { settings.coParent = coParentCheckbox.checked; saveSettingsDebounced(); updatePetUI(); });
    const seedSelectorDiv = document.createElement('div');
    seedSelectorDiv.classList.add('flex-container');
    const seedLabel = document.createElement('label');
    seedLabel.textContent = t`Seed Type`;
    const seedSelect = document.createElement('select');
    seedSelect.classList.add('text_pole');
    for (const key in SEED_SERIES) { const option = document.createElement('option'); option.value = key; option.textContent = SEED_SERIES[key].name; if (key === settings.seedType) option.selected = true; seedSelect.append(option); }
    seedSelect.addEventListener('change', () => { if (confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) { settings.seedType = seedSelect.value; settings.growthPoints = 0; settings.hasBug = false; settings.lastWatered = 0; settings.lastFertilized = 0; saveSettingsDebounced(); updatePetUI(); updateSettingsUI(); } else { seedSelect.value = settings.seedType; } });
    seedSelectorDiv.append(seedLabel, seedSelect);
    const statusDiv = document.createElement('div');
    statusDiv.classList.add('status-box');
    statusDiv.innerHTML = `<h4>${t`Current Status`}</h4><div class="status-line"><span>${t`Stage:`}</span><span id="flower-pet-status-stage"></span></div><div class="status-line"><span>${t`Growth:`}</span><span id="flower-pet-status-growth"></span></div>`;
    const resetDiv = document.createElement('div');
    resetDiv.classList.add('flex-container');
    const resetButton = document.createElement('button');
    resetButton.classList.add('menu_button', 'fa-solid', 'fa-undo');
    resetButton.title = t`Reset Growth`;
    resetButton.addEventListener('click', resetPlant);
    const resetLabel = document.createElement('label');
    resetLabel.textContent = t`Reset Growth`;
    resetDiv.append(resetButton, resetLabel);
    inlineDrawerContent.append(enabledLabel, coParentLabel, seedSelectorDiv, statusDiv, resetDiv);
    settingsContainer.append(inlineDrawer);
}

function createPetUI() {
    if (document.getElementById('flower-pet-container')) return;
    petContainer = document.createElement('div');
    petContainer.id = 'flower-pet-container';
    petContainer.innerHTML = `<div id="flower-pet-display"><div id="flower-pet-stage"></div><div id="flower-pet-bug" style="display: none;">🐞</div></div><div id="flower-pet-progress-bar"><div id="flower-pet-progress-fill"></div></div><div id="flower-pet-actions"><button id="flower-pet-water" title="${t`Water`}">${'💧'}</button><button id="flower-pet-fertilize" title="${t`Fertilize`}">${'✨'}</button><button id="flower-pet-bug-action" title="${t`Catch Bug`}">${'🥅'}</button></div>`;
    document.body.appendChild(petContainer);
    stageDisplay = document.getElementById('flower-pet-stage'); bugDisplay = document.getElementById('flower-pet-bug'); progressFill = document.getElementById('flower-pet-progress-fill'); actionsContainer = document.getElementById('flower-pet-actions'); waterButton = document.getElementById('flower-pet-water'); fertilizeButton = document.getElementById('flower-pet-fertilize'); bugButton = document.getElementById('flower-pet-bug-action');
    petContainer.addEventListener('mousedown', handlePressStart); document.addEventListener('mousemove', handlePressMove); document.addEventListener('mouseup', handlePressEnd); petContainer.addEventListener('touchstart', handlePressStart, { passive: false }); document.addEventListener('touchmove', handlePressMove, { passive: false }); document.addEventListener('touchend', handlePressEnd);
    waterButton.addEventListener('click', waterPlant); fertilizeButton.addEventListener('click', fertilizePlant); bugButton.addEventListener('click', catchBug);
}

function updatePetUI() {
    const settings = getSettings();
    if (!petContainer) return;
    petContainer.style.display = settings.enabled ? 'flex' : 'none';
    if (!settings.enabled) return;
    petContainer.title = settings.coParent ? t`Nurture with {name2}`.replace('{name2}', name2) : t`Your little flower that grows as you chat.`;
    const series = SEED_SERIES[settings.seedType] || SEED_SERIES.flowers;
    let currentStage = series.stages[0], nextStage = series.stages[1] || currentStage;
    for (let i = series.stages.length - 1; i >= 0; i--) { if (settings.growthPoints >= series.stages[i].threshold) { currentStage = series.stages[i]; nextStage = series.stages[i + 1] || currentStage; break; } }
    stageDisplay.textContent = currentStage.visual;
    const progress = (settings.growthPoints - currentStage.threshold) / (nextStage.threshold - currentStage.threshold || 1);
    progressFill.style.width = `${Math.min(100, progress * 100)}%`;
    bugDisplay.style.display = settings.hasBug ? 'block' : 'none';
    bugButton.style.display = settings.hasBug ? 'flex' : 'none';
    stageDisplay.style.transform = settings.hasBug ? 'rotate(-5deg)' : 'rotate(0deg)';
    const now = Date.now();
    waterButton.disabled = (now - settings.lastWatered) < WATER_COOLDOWN;
    fertilizeButton.disabled = (now - settings.lastFertilized) < FERTILIZE_COOLDOWN;
    if (settings.position.top !== null) { petContainer.style.top = `${settings.position.top}px`; petContainer.style.left = `${settings.position.left}px`; } else { setTimeout(() => { const margin = 20; try { petContainer.style.top = `${window.innerHeight - petContainer.offsetHeight - margin}px`; petContainer.style.left = `${window.innerWidth - petContainer.offsetWidth - margin}px`; } catch(e) {} }, 0); }
}

function onMessage() {
    const settings = getSettings();
    if (settings.hasBug) return;
    addGrowthPoints(1, 'chat');
    if (Math.random() < BUG_CHANCE) { settings.hasBug = true; saveSettingsDebounced(); updatePetUI(); showFloatingAnimation(`! 🐞`); }
}

// --- 启动逻辑 ---
(function () {
    const settings = getSettings();
    addExtensionSettings(settings);
    createPetUI();
    updatePetUI();
    updateSettingsUI();
    eventSource.on(event_types.MESSAGE_SENT, () => onMessage());
    eventSource.on(event_types.MESSAGE_RECEIVED, () => onMessage());
    eventSource.on(event_types.CHAT_CHANGED, () => { updatePetUI(); updateSettingsUI(); });
    window.addEventListener('resize', () => { if(petContainer && getSettings().enabled){ try { const maxLeft = window.innerWidth - petContainer.offsetWidth; const maxTop = window.innerHeight - petContainer.offsetHeight; petContainer.style.left = `${Math.min(parseInt(petContainer.style.left), maxLeft)}px`; petContainer.style.top = `${Math.min(parseInt(petContainer.style.top), maxTop)}px`; } catch(e) {} } });
    setInterval(() => { if (getSettings().enabled) { updatePetUI(); updateSettingsUI(); } }, 5000);
})();