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
const LONG_PRESS_DURATION = 300;
const WATER_COOLDOWN = 15 * 60 * 1000;
const SUNLIGHT_COOLDOWN = 15 * 60 * 1000;
const BUG_CHANCE = 0.05;

const SEED_SERIES = {
    flowers: { name: t`Flower Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍀' }, { threshold: 60, visual: '🌸' }, { threshold: 100, visual: '🌻' }, { threshold: 150, visual: '🌷' }, { threshold: 220, visual: '🌹' }, { threshold: 300, visual: '🌺' }, ], },
    vegetables: { name: t`Vegetable Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🥬' }, { threshold: 60, visual: '🥦' }, { threshold: 100, visual: '🥕' }, { threshold: 150, visual: '🌽' }, { threshold: 220, visual: '🍅' }, { threshold: 300, visual: '🍆' }, ], },
    fruits: { name: t`Fruit Series`, stages: [ { threshold: 0, visual: '🌱' }, { threshold: 10, visual: '🌿' }, { threshold: 30, visual: '🍇' }, { threshold: 60, visual: '🍓' }, { threshold: 100, visual: '🍉' }, { threshold: 150, visual: '🍍' }, { threshold: 220, visual: '🍎' }, { threshold: 300, visual: '🍑' }, ], },
};

const defaultSettings = {
    enabled: true, growthPoints: 0, seedType: 'flowers', coParent: false, hasBug: false,
    lastWatered: 0, lastSunlight: 0, position: { top: null, left: null },
};

// --- 状态和DOM引用 ---
let isDragging = false, pressTimer = null, offsetX, offsetY;
let petContainer, stageDisplay, bugDisplay, progressFill, actionsContainer, progressBar;
let waterButton, sunlightButton, bugButton;
let dragPosition = { x: 0, y: 0 }, animationFrameId = null;
let touchStartedOnButton = false;
let lastVisiblePosition = { top: null, left: null }; // 新增：保存最后可见位置

// --- 核心函数 ---

function getSettings() { 
    if (extension_settings[MODULE] === undefined) { 
        extension_settings[MODULE] = structuredClone(defaultSettings); 
    } 
    if (extension_settings[MODULE].lastFertilized) { 
        extension_settings[MODULE].lastSunlight = extension_settings[MODULE].lastFertilized; 
        delete extension_settings[MODULE].lastFertilized; 
    } 
    Object.assign(extension_settings[MODULE], { ...defaultSettings, ...extension_settings[MODULE] }); 
    return extension_settings[MODULE]; 
}

function dragLoop() { 
    if (!isDragging) { 
        animationFrameId = null; 
        return; 
    } 
    petContainer.style.left = `${dragPosition.x}px`; 
    petContainer.style.top = `${dragPosition.y}px`; 
    animationFrameId = requestAnimationFrame(dragLoop); 
}

function handlePressStart(e) {
    if (e.type === 'touchstart') {
        const target = e.touches[0].target;
        touchStartedOnButton = target.closest('#flower-pet-actions button') !== null;
        if (touchStartedOnButton) {
            return;
        }
    }
    
    e.preventDefault();
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
        isDragging = true;
        const petRect = petContainer.getBoundingClientRect();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        offsetX = clientX - petRect.left;
        offsetY = clientY - petRect.top;
        petContainer.style.cursor = 'grabbing';
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(dragLoop);
        }
    }, LONG_PRESS_DURATION);
}

function handlePressMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    let newLeft = clientX - offsetX;
    let newTop = clientY - offsetY;
    
    // 限制在可视区域内
    const maxLeft = window.innerWidth - petContainer.offsetWidth;
    const maxTop = window.innerHeight - petContainer.offsetHeight;
    dragPosition.x = Math.max(0, Math.min(newLeft, maxLeft));
    dragPosition.y = Math.max(0, Math.min(newTop, maxTop));
}

function handlePressEnd() {
    clearTimeout(pressTimer);
    if (isDragging) {
        isDragging = false;
        petContainer.style.cursor = 'grab';
        const settings = getSettings();
        
        // 确保保存的位置在安全范围内
        const maxLeft = window.innerWidth - petContainer.offsetWidth;
        const maxTop = window.innerHeight - petContainer.offsetHeight;
        settings.position.left = Math.max(0, Math.min(dragPosition.x, maxLeft));
        settings.position.top = Math.max(0, Math.min(dragPosition.y, maxTop));
        
        // 保存最后可见位置
        lastVisiblePosition.left = settings.position.left;
        lastVisiblePosition.top = settings.position.top;
        
        saveSettingsDebounced();
    } else if (!touchStartedOnButton) {
        toggleActionsMenu();
    }
    touchStartedOnButton = false;
}

function showFloatingAnimation(text) { 
    const animation = document.createElement('div');
    animation.className = 'floating-animation';
    animation.textContent = text;
    if (window.matchMedia("(max-width: 768px)").matches) {
        animation.style.fontSize = '14px';
        animation.style.padding = '4px 8px';
    }
    petContainer.appendChild(animation);
    setTimeout(() => animation.remove(), 1500); 
}

function toggleActionsMenu() { 
    actionsContainer.classList.toggle('visible'); 
    progressBar.classList.toggle('visible-extra'); 
}

function triggerIconAnimation(buttonElement) { 
    buttonElement.classList.add('icon-activated'); 
    setTimeout(() => buttonElement.classList.remove('icon-activated'), 500); 
}

function formatTime(ms) { 
    const totalSeconds = Math.floor(ms / 1000); 
    const minutes = Math.floor(totalSeconds / 60); 
    const seconds = totalSeconds % 60; 
    return `${minutes}m ${seconds}s`; 
}

function waterPlant() { 
    const settings = getSettings(); 
    const now = Date.now(); 
    if ((now - settings.lastWatered) < WATER_COOLDOWN) { 
        showFloatingAnimation(`💧 ${t`I'm full!`}`); 
    } else { 
        settings.lastWatered = now; 
        addGrowthPoints(5); 
        showFloatingAnimation(`${t`Watered!`} 💧`); 
        triggerIconAnimation(waterButton); 
    } 
}

function giveSunlight() { 
    const settings = getSettings(); 
    const now = Date.now(); 
    if ((now - settings.lastSunlight) < SUNLIGHT_COOLDOWN) { 
        showFloatingAnimation(`☀️ ${t`Too much sun!`}`); 
    } else { 
        settings.lastSunlight = now; 
        addGrowthPoints(5); 
        showFloatingAnimation(`${t`Sunlight!`} ☀️`); 
        triggerIconAnimation(sunlightButton); 
    } 
}

function catchBug() { 
    const settings = getSettings(); 
    settings.hasBug = false; 
    addGrowthPoints(20); 
    showFloatingAnimation(`✔️ +20`); 
    triggerIconAnimation(bugButton); 
}

function addGrowthPoints(points) { 
    const settings = getSettings(); 
    if (!settings.enabled || settings.hasBug) return; 
    settings.growthPoints += points; 
    updatePetUI(); 
    updateSettingsUI(); 
    saveSettingsDebounced(); 
}

function resetPlant() { 
    if (!confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) return; 
    const settings = getSettings(); 
    Object.assign(settings, { growthPoints: 0, hasBug: false, lastWatered: 0, lastSunlight: 0 }); 
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
    for (let i = series.stages.length - 1; i >= 0; i--) { 
        if (settings.growthPoints >= series.stages[i].threshold) { 
            currentStage = series.stages[i]; 
            break; 
        } 
    } 
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
    enabledCheckbox.addEventListener('change', () => { 
        settings.enabled = enabledCheckbox.checked; 
        saveSettingsDebounced(); 
        updatePetUI(); 
    }); 
    const coParentLabel = document.createElement('label'); 
    coParentLabel.classList.add('checkbox_label'); 
    coParentLabel.innerHTML = `<input id="flowerPetCoParent" type="checkbox"><span>${t`Nurture with {name2}`.replace('{name2}', name2)}</span>`; 
    const coParentCheckbox = coParentLabel.querySelector('#flowerPetCoParent'); 
    coParentCheckbox.checked = settings.coParent; 
    coParentCheckbox.addEventListener('change', () => { 
        settings.coParent = coParentCheckbox.checked; 
        saveSettingsDebounced(); 
        updatePetUI(); 
    }); 
    const seedSelectorDiv = document.createElement('div'); 
    seedSelectorDiv.classList.add('flex-container'); 
    const seedLabel = document.createElement('label'); 
    seedLabel.textContent = t`Seed Type`; 
    const seedSelect = document.createElement('select'); 
    seedSelect.classList.add('text_pole'); 
    for (const key in SEED_SERIES) { 
        const option = document.createElement('option'); 
        option.value = key; 
        option.textContent = SEED_SERIES[key].name; 
        if (key === settings.seedType) option.selected = true; 
        seedSelect.append(option); 
    } 
    seedSelect.addEventListener('change', () => { 
        if (confirm(t`Resetting will start your progress over with a new plant. Are you sure?`)) { 
            settings.seedType = seedSelect.value; 
            Object.assign(settings, { growthPoints: 0, hasBug: false, lastWatered: 0, lastSunlight: 0 }); 
            saveSettingsDebounced(); 
            updatePetUI(); 
            updateSettingsUI(); 
        } else { 
            seedSelect.value = settings.seedType; 
        } 
    }); 
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
    
    if (window.matchMedia("(max-width: 768px)").matches) {
        petContainer.classList.add('mobile');
    }
    
    petContainer.innerHTML = `<div id="flower-pet-actions"><button id="flower-pet-water" title="${t`Water`}">${'💧'}</button><button id="flower-pet-sunlight" title="${t`Sunlight`}">${'☀️'}</button><button id="flower-pet-bug-action" title="${t`Catch Bug`}">${'🥅'}</button></div><div id="flower-pet-display-wrapper"><div id="flower-pet-display"><div id="flower-pet-stage"></div><div id="flower-pet-bug" style="display: none;">🐞</div></div><div id="flower-pet-progress-bar"><div id="flower-pet-progress-fill"></div></div></div>`;
    document.body.appendChild(petContainer);
    stageDisplay = document.getElementById('flower-pet-stage'); 
    bugDisplay = document.getElementById('flower-pet-bug'); 
    progressFill = document.getElementById('flower-pet-progress-fill'); 
    actionsContainer = document.getElementById('flower-pet-actions'); 
    waterButton = document.getElementById('flower-pet-water'); 
    sunlightButton = document.getElementById('flower-pet-sunlight'); 
    bugButton = document.getElementById('flower-pet-bug-action'); 
    progressBar = document.getElementById('flower-pet-progress-bar');
    
    // 绑定拖动事件
    petContainer.addEventListener('mousedown', handlePressStart); 
    document.addEventListener('mousemove', handlePressMove); 
    document.addEventListener('mouseup', handlePressEnd);
    petContainer.addEventListener('touchstart', handlePressStart, { passive: false }); 
    document.addEventListener('touchmove', handlePressMove, { passive: false }); 
    document.addEventListener('touchend', handlePressEnd);
    
    // 按钮触摸事件处理
    [waterButton, sunlightButton, bugButton].forEach(button => {
        button.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            touchStartedOnButton = true;
        });
        button.addEventListener('touchend', (e) => {
            e.stopPropagation();
            if (touchStartedOnButton) {
                button.click();
            }
            touchStartedOnButton = false;
        });
    });
    
    // 按钮点击事件
    waterButton.addEventListener('click', (e) => { e.stopPropagation(); waterPlant(); });
    sunlightButton.addEventListener('click', (e) => { e.stopPropagation(); giveSunlight(); });
    bugButton.addEventListener('click', (e) => { e.stopPropagation(); catchBug(); });
}

function updatePetUI() {
    const settings = getSettings(); 
    if (!petContainer) return; 
    
    // 确保不会意外隐藏
    petContainer.style.display = settings.enabled ? 'flex' : 'none'; 
    if (!settings.enabled) return;
    
    // 移动设备UI调整
    if (window.matchMedia("(max-width: 768px)").matches) {
        stageDisplay.style.fontSize = '36px';
        [waterButton, sunlightButton, bugButton].forEach(btn => {
            btn.style.width = '40px';
            btn.style.height = '40px';
            btn.style.fontSize = '18px';
        });
    } else {
        stageDisplay.style.fontSize = ''; // 重置为默认
        [waterButton, sunlightButton, bugButton].forEach(btn => {
            btn.style.width = '';
            btn.style.height = '';
            btn.style.fontSize = '';
        });
    }
    
    petContainer.title = settings.coParent ? t`Nurture with {name2}`.replace('{name2}', name2) : t`Your little flower that grows as you chat.`;
    const series = SEED_SERIES[settings.seedType] || SEED_SERIES.flowers; 
    let currentStage = series.stages[0], nextStage = series.stages[1] || currentStage; 
    for (let i = series.stages.length - 1; i >= 0; i--) { 
        if (settings.growthPoints >= series.stages[i].threshold) { 
            currentStage = series.stages[i]; 
            nextStage = series.stages[i + 1] || currentStage; 
            break; 
        } 
    }
    stageDisplay.textContent = currentStage.visual; 
    const progress = (settings.growthPoints - currentStage.threshold) / (nextStage.threshold - currentStage.threshold || 1); 
    progressFill.style.width = `${Math.min(100, progress * 100)}%`; 
    bugDisplay.style.display = settings.hasBug ? 'block' : 'none'; 
    bugButton.style.display = settings.hasBug ? 'flex' : 'none'; 
    stageDisplay.style.transform = settings.hasBug ? 'rotate(-5deg)' : 'rotate(0deg)';
    
    // 冷却时间处理
    const now = Date.now();
    const waterCooldownRemaining = WATER_COOLDOWN - (now - settings.lastWatered);
    if (waterCooldownRemaining > 0) { 
        waterButton.disabled = true; 
        waterButton.title = t`Cooldown: {time}`.replace('{time}', formatTime(waterCooldownRemaining)); 
    } else { 
        waterButton.disabled = false; 
        waterButton.title = t`Water`; 
    }
    
    const sunlightCooldownRemaining = SUNLIGHT_COOLDOWN - (now - settings.lastSunlight);
    if (sunlightCooldownRemaining > 0) { 
        sunlightButton.disabled = true; 
        sunlightButton.title = t`Cooldown: {time}`.replace('{time}', formatTime(sunlightCooldownRemaining)); 
    } else { 
        sunlightButton.disabled = false; 
        sunlightButton.title = t`Sunlight`; 
    }
    
    // 位置处理 - 确保在可视区域内
    const maxLeft = window.innerWidth - petContainer.offsetWidth;
    const maxTop = window.innerHeight - petContainer.offsetHeight;
    
    if (settings.position.top !== null && !isDragging) { 
        // 限制位置在安全范围内
        const safeLeft = Math.max(0, Math.min(settings.position.left, maxLeft));
        const safeTop = Math.max(0, Math.min(settings.position.top, maxTop));
        petContainer.style.top = `${safeTop}px`; 
        petContainer.style.left = `${safeLeft}px`; 
        
        // 更新最后可见位置
        lastVisiblePosition.top = safeTop;
        lastVisiblePosition.left = safeLeft;
    } else if (settings.position.top === null) { 
        // 初始位置设置
        setTimeout(() => { 
            if (isDragging) return; 
            const margin = 20; 
            try { 
                const scale = window.matchMedia("(max-width: 768px)").matches ? 0.6 : 1; 
                const scaledHeight = petContainer.offsetHeight * scale; 
                const scaledWidth = petContainer.offsetWidth * scale; 
                const initialTop = window.innerHeight - scaledHeight - margin;
                const initialLeft = window.innerWidth - scaledWidth - margin;
                
                petContainer.style.top = `${initialTop}px`; 
                petContainer.style.left = `${initialLeft}px`; 
                
                // 保存初始位置
                lastVisiblePosition.top = initialTop;
                lastVisiblePosition.left = initialLeft;
            } catch(e) {
                console.error("Error setting initial position:", e);
            } 
        }, 0); 
    }
}

function onMessage() { 
    const settings = getSettings(); 
    if (settings.hasBug) return; 
    addGrowthPoints(1); 
    showFloatingAnimation(`💬 +1`); 
    if (Math.random() < BUG_CHANCE) { 
        settings.hasBug = true; 
        saveSettingsDebounced(); 
        updatePetUI(); 
        showFloatingAnimation(`! 🐞`); 
    } 
}

(function () {
    const settings = getSettings(); 
    addExtensionSettings(settings); 
    createPetUI(); 
    updatePetUI(); 
    updateSettingsUI();
    
    // 窗口大小变化处理
    window.addEventListener('resize', () => {
        if (petContainer) {
            if (window.matchMedia("(max-width: 768px)").matches) {
                petContainer.classList.add('mobile');
            } else {
                petContainer.classList.remove('mobile');
            }
            
            // 调整位置以适应新窗口大小
            if (getSettings().enabled && lastVisiblePosition.top !== null) {
                const maxLeft = window.innerWidth - petContainer.offsetWidth;
                const maxTop = window.innerHeight - petContainer.offsetHeight;
                const adjustedLeft = Math.max(0, Math.min(lastVisiblePosition.left, maxLeft));
                const adjustedTop = Math.max(0, Math.min(lastVisiblePosition.top, maxTop));
                
                petContainer.style.left = `${adjustedLeft}px`;
                petContainer.style.top = `${adjustedTop}px`;
                
                // 更新保存的位置
                const settings = getSettings();
                settings.position.left = adjustedLeft;
                settings.position.top = adjustedTop;
                lastVisiblePosition.left = adjustedLeft;
                lastVisiblePosition.top = adjustedTop;
                saveSettingsDebounced();
            }
            
            updatePetUI();
        }
    });
    
    eventSource.on(event_types.MESSAGE_SENT, () => onMessage()); 
    eventSource.on(event_types.MESSAGE_RECEIVED, () => onMessage()); 
    eventSource.on(event_types.CHAT_CHANGED, () => { updatePetUI(); updateSettingsUI(); });
    
    // 定期检查位置和状态
    setInterval(() => { 
        if (getSettings().enabled) { 
            updatePetUI(); 
            updateSettingsUI(); 
        } 
    }, 5000);
})();
