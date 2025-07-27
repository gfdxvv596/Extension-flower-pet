import {
    name2,
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { t } from '../../../i18n.js';

const MODULE = 'flower_pet';

// --- 配置和常量 ---
const TAP_MAX_DURATION = 250; // ms
const TAP_MAX_DISTANCE = 10; // px
const WATER_COOLDOWN = 15 * 60 * 1000;
const SUNLIGHT_COOLDOWN = 15 * 60 * 1000;
const BUG_CHANCE = 0.05;

const SEED_SERIES = { flowers: { name: t`Flower Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍀' }, { threshold: 60, visual: '🌸' }, { threshold: 100, visual: '🌻' }, { threshold: 150, visual: '🌷' }, { threshold: 220, visual: '🌹' }, { threshold: 300, visual: '🌺' }, ], }, vegetables: { name: t`Vegetable Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🥬' }, { threshold: 60, visual: '🥦' }, { threshold: 100, visual: '🥕' }, { threshold: 150, visual: '🌽' }, { threshold: 220, visual: '🍅' }, { threshold: 300, visual: '🍆' }, ], }, fruits: { name: t`Fruit Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍇' }, { threshold: 60, visual: '🍓' }, { threshold: 100, visual: '🍉' }, { threshold: 150, visual: '🍍' }, { threshold: 220, visual: '🍎' }, { threshold: 300, visual: '🍑' }, ], }, };
const defaultSettings = { enabled: true, growthPoints: 0, seedType: 'flowers', coParent: false, hasBug: false, lastWatered: 0, lastSunlight: 0, position: { top: null, left: null }, };

// --- 状态和DOM引用 ---
let isDragging = false, isPressing = false, pressStartTime = 0;
let pressStartPos = { x: 0, y: 0 };
let startPetPos = { x: 0, y: 0 };
let petContainer, stageDisplay, bugDisplay, progressFill, actionsContainer, progressBar, displayWrapper;
let waterButton, sunlightButton, bugButton;
let animationFrameId = null;

// --- 核心函数 ---
function getSettings() { if (extension_settings[MODULE] === undefined) { extension_settings[MODULE] = structuredClone(defaultSettings); } if (extension_settings[MODULE].lastFertilized) { extension_settings[MODULE].lastSunlight = extension_settings[MODULE].lastFertilized; delete extension_settings[MODULE].lastFertilized; } Object.assign(extension_settings[MODULE], { ...defaultSettings, ...extension_settings[MODULE] }); return extension_settings[MODULE]; }
function showFloatingAnimation(text) { const animation = document.createElement('div'); animation.className = 'floating-animation'; animation.textContent = text; petContainer.appendChild(animation); setTimeout(() => animation.remove(), 1500); }
function showBubbleMessage(message) { const bubble = document.createElement('div'); bubble.className = 'bubble-tooltip'; bubble.textContent = message; displayWrapper.appendChild(bubble); setTimeout(() => bubble.remove(), 2500); }
function toggleActionsMenu() { actionsContainer.classList.toggle('visible'); progressBar.classList.toggle('visible-extra'); }
function triggerIconAnimation(buttonElement) { buttonElement.classList.add('icon-activated'); setTimeout(() => buttonElement.classList.remove('icon-activated'), 500); }
function formatTime(ms) { const totalSeconds = Math.floor(ms / 1000); const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60; return `${minutes}m ${seconds}s`; }

// --- 健壮的事件处理模型 ---
function handlePressStart(e) { isPressing = true; isDragging = false; pressStartTime = Date.now(); const touch = e.type === 'touchstart' ? e.touches[0] : e; pressStartPos = { x: touch.clientX, y: touch.clientY }; const rect = petContainer.getBoundingClientRect(); startPetPos = { x: rect.left, y: rect.top }; if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; } }
function handlePressMove(e) { if (!isPressing) return; const touch = e.type === 'touchmove' ? e.touches[0] : e; const currentPos = { x: touch.clientX, y: touch.clientY }; const distance = Math.hypot(currentPos.x - pressStartPos.x, currentPos.y - pressStartPos.y); if (!isDragging && distance > TAP_MAX_DISTANCE) { isDragging = true; } if (isDragging) { if (!animationFrameId) { animationFrameId = requestAnimationFrame(() => { const scale = window.matchMedia("(max-width: 768px)").matches ? 0.6 : 1; const deltaX = currentPos.x - pressStartPos.x; const deltaY = currentPos.y - pressStartPos.y; const newX = startPetPos.x + (deltaX / scale); const newY = startPetPos.y + (deltaY / scale); const maxLeft = window.innerWidth - petContainer.offsetWidth; const maxTop = window.innerHeight - petContainer.offsetHeight; petContainer.style.left = `${Math.max(0, Math.min(newX, maxLeft))}px`; petContainer.style.top = `${Math.max(0, Math.min(newY, maxTop))}px`; animationFrameId = null; }); } } }
function handlePressEnd() { if (!isPressing) return; const pressDuration = Date.now() - pressStartTime; if (isDragging && pressDuration > TAP_MAX_DURATION) { const settings = getSettings(); const finalRect = petContainer.getBoundingClientRect(); const scale = window.matchMedia("(max-width: 768px)").matches ? 0.6 : 1; settings.position.left = finalRect.left / scale; settings.position.top = finalRect.top / scale; saveSettingsDebounced(); } else { toggleActionsMenu(); } isPressing = false; isDragging = false; }

function waterPlant() { const settings = getSettings(); const now = Date.now(); if ((now - settings.lastWatered) < WATER_COOLDOWN) { showBubbleMessage(`💧 ${t`I'm full!`}`); } else { settings.lastWatered = now; addGrowthPoints(5); showFloatingAnimation(`${t`Watered!`} 💧`); triggerIconAnimation(waterButton); } }
function giveSunlight() { const settings = getSettings(); const now = Date.now(); if ((now - settings.lastSunlight) < SUNLIGHT_COOLDOWN) { showBubbleMessage(`☀️ ${t`Too much sun!`}`); } else { settings.lastSunlight = now; addGrowthPoints(5); showFloatingAnimation(`${t`Sunlight!`} ☀️`); triggerIconAnimation(sunlightButton); } }
function catchBug() { const settings = getSettings(); settings.hasBug = false; addGrowthPoints(20); showFloatingAnimation(`✔️ +20`); triggerIconAnimation(bugButton); }
function addGrowthPoints(points) { const settings = getSettings(); if (!settings.enabled || settings.hasBug) return; settings.growthPoints += points; updatePetUI(); updateSettingsUI(); saveSettingsDebounced(); }
function resetPlant() { if (!confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) return; const settings = getSettings(); Object.assign(settings, { growthPoints: 0, hasBug: false, lastWatered: 0, lastSunlight: 0 }); saveSettingsDebounced(); updatePetUI(); updateSettingsUI(); }

function updateSettingsUI() { const settings = getSettings(); const statusStage = document.getElementById('flower-pet-status-stage'); const statusGrowth = document.getElementById('flower-pet-status-growth'); if (!statusStage || !statusGrowth) return; const series = SEED_SERIES[settings.seedType] || SEED_SERIES.flowers; let currentStage = series.stages[0]; for (let i = series.stages.length - 1; i >= 0; i--) { if (settings.growthPoints >= series.stages[i].threshold) { currentStage = series.stages[i]; break; } } statusStage.textContent = `${currentStage.visual} (${series.stages.indexOf(currentStage) + 1} / ${series.stages.length})`; statusGrowth.textContent = `${settings.growthPoints}`; }
function addExtensionSettings(settings) { const settingsContainer = document.getElementById('extensions_settings'); if (!settingsContainer) return; const inlineDrawer = document.createElement('div'); inlineDrawer.classList.add('inline-drawer'); const inlineDrawerToggle = document.createElement('div'); inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header'); inlineDrawerToggle.innerHTML = `<b>${t`Desktop Flower Pet`}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>`; const inlineDrawerContent = document.createElement('div'); inlineDrawerContent.classList.add('inline-drawer-content'); inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent); const enabledLabel = document.createElement('label'); enabledLabel.classList.add('checkbox_label'); enabledLabel.innerHTML = `<input id="flowerPetEnabled" type="checkbox"><span>${t`Enabled`}</span>`; const enabledCheckbox = enabledLabel.querySelector('#flowerPetEnabled'); enabledCheckbox.checked = settings.enabled; enabledCheckbox.addEventListener('change', () => { settings.enabled = enabledCheckbox.checked; saveSettingsDebounced(); updatePetUI(); }); const coParentLabel = document.createElement('label'); coParentLabel.classList.add('checkbox_label'); coParentLabel.innerHTML = `<input id="flowerPetCoParent" type="checkbox"><span>${t`Nurture with {name2}`.replace('{name2}', name2)}</span>`; const coParentCheckbox = coParentLabel.querySelector('#flowerPetCoParent'); coParentCheckbox.checked = settings.coParent; coParentCheckbox.addEventListener('change', () => { settings.coParent = coParentCheckbox.checked; saveSettingsDebounced(); updatePetUI(); }); const seedSelectorDiv = document.createElement('div'); seedSelectorDiv.classList.add('flex-container'); const seedLabel = document.createElement('label'); seedLabel.textContent = t`Seed Type`; const seedSelect = document.createElement('select'); seedSelect.classList.add('text_pole'); for (const key in SEED_SERIES) { const option = document.createElement('option'); option.value = key; option.textContent = SEED_SERIES[key].name; if (key === settings.seedType) option.selected = true; seedSelect.append(option); } seedSelect.addEventListener('change', () => { if (confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) { settings.seedType = seedSelect.value; Object.assign(settings, { growthPoints: 0, hasBug: false, lastWatered: 0, lastSunlight: 0 }); saveSettingsDebounced(); updatePetUI(); updateSettingsUI(); } else { seedSelect.value = settings.seedType; } }); seedSelectorDiv.append(seedLabel, seedSelect); const statusDiv = document.createElement('div'); statusDiv.classList.add('status-box'); statusDiv.innerHTML = `<h4>${t`Current Status`}</h4><div class="status-line"><span>${t`Stage:`}</span><span id="flower-pet-status-stage"></span></div><div class="status-line"><span>${t`Growth:`}</span><span id="flower-pet-status-growth"></span></div>`; const resetDiv = document.createElement('div'); resetDiv.classList.add('flex-container'); const resetButton = document.createElement('button'); resetButton.classList.add('menu_button', 'fa-solid', 'fa-undo'); resetButton.title = t`Reset Growth`; resetButton.addEventListener('click', resetPlant); const resetLabel = document.createElement('label'); resetLabel.textContent = t`Reset Growth`; resetDiv.append(resetButton, resetLabel); inlineDrawerContent.append(enabledLabel, coParentLabel, seedSelectorDiv, statusDiv, resetDiv); settingsContainer.append(inlineDrawer); }

function createPetUI() {
    if (document.getElementById('flower-pet-container')) return;
    petContainer = document.createElement('div'); petContainer.id = 'flower-pet-container';
    petContainer.innerHTML = `<div id="flower-pet-actions"><button id="flower-pet-water" title="${t`Water`}">${'💧'}</button><button id="flower-pet-sunlight" title="${t`Sunlight`}">${'☀️'}</button><button id="flower-pet-bug-action" title="${t`Catch Bug`}">${'🥅'}</button></div><div id="flower-pet-display-wrapper"><div id="flower-pet-display"><div id="flower-pet-stage"></div><div id="flower-pet-bug" style="display: none;">🐞</div></div><div id="flower-pet-progress-bar"><div id="flower-pet-progress-fill"></div></div></div>`;
    document.body.appendChild(petContainer);
    stageDisplay = document.getElementById('flower-pet-stage'); bugDisplay = document.getElementById('flower-pet-bug'); progressFill = document.getElementById('flower-pet-progress-fill'); actionsContainer = document.getElementById('flower-pet-actions'); waterButton = document.getElementById('flower-pet-water'); sunlightButton = document.getElementById('flower-pet-sunlight'); bugButton = document.getElementById('flower-pet-bug-action'); progressBar = document.getElementById('flower-pet-progress-bar'); displayWrapper = document.getElementById('flower-pet-display-wrapper');
    const displayArea = document.getElementById('flower-pet-display');
    displayArea.addEventListener('mousedown', handlePressStart); displayArea.addEventListener('touchstart', handlePressStart, { passive: true });
    document.addEventListener('mousemove', handlePressMove); document.addEventListener('touchmove', handlePressMove, { passive: false });
    document.addEventListener('mouseup', handlePressEnd); document.addEventListener('touchend', handlePressEnd);
    waterButton.addEventListener('click', waterPlant); sunlightButton.addEventListener('click', giveSunlight); bugButton.addEventListener('click', catchBug);
}

function updatePetUI() {
    const settings = getSettings(); if (!petContainer) return; petContainer.style.display = settings.enabled ? 'flex' : 'none'; if (!settings.enabled) return;
    petContainer.title = settings.coParent ? t`Nurture with {name2}`.replace('{name2}', name2) : t`Your little flower that grows as you chat.`;
    const series = SEED_SERIES[settings.seedType] || SEED_SERIES.flowers; let currentStage = series.stages[0], nextStage = series.stages[1] || currentStage; for (let i = series.stages.length - 1; i >= 0; i--) { if (settings.growthPoints >= series.stages[i].threshold) { currentStage = series.stages[i]; nextStage = series.stages[i + 1] || currentStage; break; } }
    stageDisplay.textContent = currentStage.visual; const progress = (settings.growthPoints - currentStage.threshold) / (nextStage.threshold - currentStage.threshold || 1); progressFill.style.width = `${Math.min(100, progress * 100)}%`; bugDisplay.style.display = settings.hasBug ? 'block' : 'none'; bugButton.style.display = settings.hasBug ? 'flex' : 'none'; stageDisplay.style.transform = settings.hasBug ? 'rotate(-5deg)' : 'rotate(0deg)';
    const now = Date.now();
    const waterCooldownRemaining = WATER_COOLDOWN - (now - settings.lastWatered); if (waterCooldownRemaining > 0) { waterButton.disabled = true; waterButton.title = t`Cooldown: {time}`.replace('{time}', formatTime(waterCooldownRemaining)); } else { waterButton.disabled = false; waterButton.title = t`Water`; }
    const sunlightCooldownRemaining = SUNLIGHT_COOLDOWN - (now - settings.lastSunlight); if (sunlightCooldownRemaining > 0) { sunlightButton.disabled = true; sunlightButton.title = t`Cooldown: {time}`.replace('{time}', formatTime(sunlightCooldownRemaining)); } else { sunlightButton.disabled = false; sunlightButton.title = t`Sunlight`; }
    
    // 定位逻辑
    if (settings.position.top !== null && !isDragging && !isPressing) {
        petContainer.style.top = `${settings.position.top}px`;
        petContainer.style.left = `${settings.position.left}px`;
    } else if (settings.position.top === null) {
        // 首次定位
        setTimeout(() => {
            if (isDragging || isPressing || getSettings().position.top !== null) return;
            const margin = 20;
            try {
                // **核心修复**
                const newLeft = window.innerWidth - petContainer.offsetWidth - margin;
                const newTop = window.innerHeight - petContainer.offsetHeight - margin;
                petContainer.style.left = `${newLeft}px`;
                petContainer.style.top = `${newTop}px`;
                // 立即将首次计算的位置保存到设置中
                settings.position.left = newLeft;
                settings.position.top = newTop;
            } catch (e) {
                console.error("Failed to initially place the pet.", e);
            }
        }, 0);
    }
}

function onMessage() { const settings = getSettings(); if (settings.hasBug) return; addGrowthPoints(1); showFloatingAnimation(`💬 +1`); if (Math.random() < BUG_CHANCE) { settings.hasBug = true; saveSettingsDebounced(); updatePetUI(); showFloatingAnimation(`! 🐞`); } }

(function () {
    const settings = getSettings(); addExtensionSettings(settings); createPetUI(); updatePetUI(); updateSettingsUI();
    eventSource.on(event_types.MESSAGE_SENT, () => onMessage()); eventSource.on(event_types.MESSAGE_RECEIVED, () => onMessage()); eventSource.on(event_types.CHAT_CHANGED, () => { updatePetUI(); updateSettingsUI(); });
    window.addEventListener('resize', () => { if(petContainer && getSettings().enabled){ try { const maxLeft = window.innerWidth - petContainer.offsetWidth; const maxTop = window.innerHeight - petContainer.offsetHeight; petContainer.style.left = `${Math.min(parseInt(petContainer.style.left), maxLeft)}px`; petContainer.style.top = `${Math.min(parseInt(petContainer.style.top), maxTop)}px`; } catch(e) {} } });
    setInterval(() => { if (getSettings().enabled) { updatePetUI(); updateSettingsUI(); } }, 5000);
})();