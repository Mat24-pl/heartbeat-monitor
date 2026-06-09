const state = {
    hr: 62,
    spo2: 98,
    etco2: 36,
    awrr: 40,
    bpSys: 120,
    bpDia: 80,
    temp: 98.6,
    alarmsSilenced: false,
    audioEnabled: false
};

const limits = {
    hr: { min: 50, max: 120, enabled: true },
    spo2: { min: 90, max: 100, enabled: true },
    etco2: { min: 25, max: 65, enabled: true },
    awrr: { min: 10, max: 60, enabled: true },
    bpSys: { min: 60, max: 160, enabled: true },
    bpDia: { min: 60, max: 110, enabled: true },
    temp: { min: 96.0, max: 101.0, enabled: true }
};

// Real MP3 audio assets (licensed royalty-free clinical/medical beep equivalents)
// With ultra-fast loading & local synthesis fail-safes (CORS/offline protection)
const soundAssets = {
    pulse: 'beep.mp3', // High fidelity single digital heartbeat beep
    alarm: 'alarm.mp3'  // Continuous medical tone alert sound
};

// Preload Audio Elements
const audioPulse = new Audio(soundAssets.pulse);
const audioAlarm = new Audio(soundAssets.alarm);
audioPulse.volume = 0.3;
audioAlarm.volume = 0.45;

// Custom logs keeping track of active alarm triggers to avoid spam
const registeredAlarmLogs = {};

const canvasEcg = document.getElementById('canvas-ecg');
const canvasPleth = document.getElementById('canvas-pleth');
const canvasCo2 = document.getElementById('canvas-co2');

const ctxEcg = canvasEcg.getContext('2d');
const ctxPleth = canvasPleth.getContext('2d');
const ctxCo2 = canvasCo2.getContext('2d');

function resizeCanvases() {
    const canvases = [
        { el: canvasEcg, ctx: ctxEcg },
        { el: canvasPleth, ctx: ctxPleth },
        { el: canvasCo2, ctx: ctxCo2 }
    ];

    canvases.forEach(item => {
        const rect = item.el.getBoundingClientRect();
        item.el.width = rect.width * window.devicePixelRatio;
        item.el.height = rect.height * window.devicePixelRatio;

        item.el.style.width = '100%';
        item.el.style.height = '100%';

        item.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    });
}
window.addEventListener('resize', resizeCanvases);

// Web Audio API Context as full fallback mechanism if MP3 fails/is blocked
let audioCtxFallback = null;
let lastHeartbeatTime = 0;

function initAudio() {
    if (!audioCtxFallback) {
        audioCtxFallback = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Play Pulse Beep: Attempt MP3 playing with pure Web Audio synthesis fail-safe
function triggerPulseSound() {
    if (!state.audioEnabled) return;
    audioPulse.currentTime = 0;
    audioPulse.play().catch(err => {
        // FALLBACK: Pure synthetic sine wave
        playSyntheticBeep(450, 0.08, 'triangle');
    });
}

// Play Warning Alert Pattern: Sequence of MP3s or synthetic pulse sequences
function triggerAlarmSoundSequence() {
    if (!state.audioEnabled || state.alarmsSilenced) return;
    audioAlarm.currentTime = 0;
    audioAlarm.play().catch(err => {
        // FALLBACK: Medical alarm high pitch sequence
        const now = audioCtxFallback.currentTime;
        for (let i = 0; i < 4; i++) {
            const timeOffset = i * 0.15;
            setTimeout(() => {
                playSyntheticBeep(980, 0.07, 'sine');
            }, timeOffset * 1000);
        }
    });
}

function playSyntheticBeep(frequency, duration, type = 'sine') {
    if (!state.audioEnabled || !audioCtxFallback) return;
    try {
        const osc = audioCtxFallback.createOscillator();
        const gainNode = audioCtxFallback.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtxFallback.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtxFallback.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtxFallback.currentTime + duration);
        osc.connect(gainNode);
        gainNode.connect(audioCtxFallback.destination);
        osc.start();
        osc.stop(audioCtxFallback.currentTime + duration);
    } catch (e) {
        console.warn("Fallback sound synthesis failed.", e);
    }
}

// System logging of active alerts
function logAlarmEvent(paramName, message) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const logBox = document.getElementById('alarm-log');

    // Avoid duplicate log spam inside one 5 seconds interval
    const key = `${paramName}_${message}`;
    const lastLogged = registeredAlarmLogs[key];
    if (lastLogged && (Date.now() - lastLogged < 5000)) return;

    registeredAlarmLogs[key] = Date.now();

    const line = document.createElement('div');
    line.innerHTML = `<span class="text-zinc-500">[${timeStr}]</span> <span class="text-red-500 font-bold">${paramName}:</span> ${message}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
}

function testAlarmSound() {
    initAudio();
    const originalAudioEnabled = state.audioEnabled;
    state.audioEnabled = true;
    triggerAlarmSoundSequence();
    state.audioEnabled = originalAudioEnabled;
}

// Advanced multi-parameter alarm rules evaluator
function checkAlarms() {
    let isAlarm = false;

    // 1. HR limits
    if (limits.hr.enabled && (state.hr > limits.hr.max || state.hr < limits.hr.min)) {
        isAlarm = true;
        document.getElementById('param-hr').classList.add('alarm-active-red');
        document.getElementById('val-hr').classList.add('text-alarm-red');
        logAlarmEvent('HR', `Tętno poza normą (${state.hr} bpm)`);
    } else {
        document.getElementById('param-hr').classList.remove('alarm-active-red');
        document.getElementById('val-hr').classList.remove('text-alarm-red');
    }

    // 2. SpO2 limits
    if (limits.spo2.enabled && (state.spo2 > limits.spo2.max || state.spo2 < limits.spo2.min)) {
        isAlarm = true;
        document.getElementById('param-spo2').classList.add('alarm-active-red');
        document.getElementById('val-spo2').classList.add('text-alarm-red');
        logAlarmEvent('SpO2', `Krytyczna desaturacja (${state.spo2}%)`);
    } else {
        document.getElementById('param-spo2').classList.remove('alarm-active-red');
        document.getElementById('val-spo2').classList.remove('text-alarm-red');
    }

    // 3. NIBP limits
    const isBpSysHigh = state.bpSys > limits.bpSys.max;
    const isBpSysLow = state.bpSys < limits.bpSys.min;
    const isBpDiaLow = state.bpDia < limits.bpDia.min;

    if (limits.bpSys.enabled && (isBpSysHigh || isBpSysLow || isBpDiaLow)) {
        isAlarm = true;
        document.getElementById('param-nbp').classList.add('alarm-active-red');
        document.getElementById('val-nbp').classList.add('text-alarm-red');
        document.getElementById('val-nbp-mean').classList.add('text-alarm-red');
        logAlarmEvent('NIBP', `Niebezpieczne ciśnienie (${state.bpSys}/${state.bpDia})`);
    } else {
        document.getElementById('param-nbp').classList.remove('alarm-active-red');
        document.getElementById('val-nbp').classList.remove('text-alarm-red');
        document.getElementById('val-nbp-mean').classList.remove('text-alarm-red');
    }

    // 4. etCO2 limits
    if (limits.etco2.enabled && (state.etco2 > limits.etco2.max || state.etco2 < limits.etco2.min)) {
        isAlarm = true;
        document.getElementById('param-etco2').classList.add('alarm-active-red');
        document.getElementById('val-etco2').classList.add('text-alarm-red');
        logAlarmEvent('etCO2', `Nieprawidłowe stężenie dwutlenku węgla (${state.etco2} mmHg)`);
    } else {
        document.getElementById('param-etco2').classList.remove('alarm-active-red');
        document.getElementById('val-etco2').classList.remove('text-alarm-red');
    }

    // Toggle visual warning in header bar
    const alarmIndicator = document.getElementById('alarm-indicator');
    if (isAlarm) {
        alarmIndicator.classList.remove('hidden');
    } else {
        alarmIndicator.classList.add('hidden');
    }

    return isAlarm;
}

const scanSpeed = 2.0;
let sweepX = 0;
const sweepGap = 40;

let lastEcgY = 0;
let lastPlethY = 0;
let lastCo2Y = 0;

// Realistic signal math models
function getECGPoint(phase) {
    let amplitude = 0;
    if (phase > 0.05 && phase < 0.12) {
        const pPhase = (phase - 0.05) / 0.07;
        amplitude = 0.12 * Math.sin(pPhase * Math.PI);
    } else if (phase >= 0.15 && phase < 0.17) {
        const qPhase = (phase - 0.15) / 0.02;
        amplitude = -0.08 * qPhase;
    } else if (phase >= 0.17 && phase < 0.20) {
        const rPhase = (phase - 0.17) / 0.03;
        if (rPhase < 0.5) {
            amplitude = -0.08 + (rPhase * 2) * 1.08;
        } else {
            amplitude = 1.0 - ((rPhase - 0.5) * 2) * 1.35;
        }
    } else if (phase >= 0.20 && phase < 0.23) {
        const sPhase = (phase - 0.20) / 0.03;
        amplitude = -0.35 + sPhase * 0.35;
    } else if (phase >= 0.35 && phase < 0.48) {
        const tPhase = (phase - 0.35) / 0.13;
        amplitude = 0.25 * Math.sin(tPhase * Math.PI);
    } else {
        amplitude = 0;
    }
    amplitude += (Math.random() - 0.5) * 0.015;
    return amplitude;
}

function getPlethPoint(phase) {
    let amplitude = 0;
    if (phase < 0.25) {
        const p = phase / 0.25;
        amplitude = Math.sin(p * Math.PI / 2);
    } else if (phase >= 0.25 && phase < 0.40) {
        const p = (phase - 0.25) / 0.15;
        amplitude = 1.0 - p * 0.35;
    } else if (phase >= 0.40 && phase < 0.48) {
        const p = (phase - 0.40) / 0.08;
        amplitude = 0.65 + 0.08 * Math.sin(p * Math.PI);
    } else {
        const p = (phase - 0.48) / 0.52;
        amplitude = 0.65 * Math.exp(-p * 1.8);
    }
    amplitude += (Math.random() - 0.5) * 0.008;
    return amplitude * (state.spo2 / 100);
}

function getCO2Point(phase) {
    let amplitude = 0;
    if (phase < 0.1) {
        amplitude = 0;
    } else if (phase >= 0.1 && phase < 0.22) {
        const p = (phase - 0.1) / 0.12;
        amplitude = Math.pow(p, 2.5);
    } else if (phase >= 0.22 && phase < 0.82) {
        const p = (phase - 0.22) / 0.60;
        amplitude = 1.0 + p * 0.08;
    } else {
        const p = (phase - 0.82) / 0.18;
        amplitude = Math.max(0, 1.08 * (1.0 - p));
    }
    if (amplitude > 0.8) {
        amplitude += (Math.random() - 0.5) * 0.02;
    }
    return amplitude;
}

function updateAndDraw() {
    const w = canvasEcg.width / window.devicePixelRatio;
    const h = canvasEcg.height / window.devicePixelRatio;

    if (w === 0 || h === 0) {
        requestAnimationFrame(updateAndDraw);
        return;
    }

    const beatDurationInSec = 60 / state.hr;
    const plethDelayOffset = 0.12;
    const breathDurationInSec = 60 / state.awrr;
    const currentTime = performance.now() / 1000;

    for (let i = 0; i < scanSpeed; i++) {
        const targetX = Math.floor(sweepX);

        // Clear ahead of sweep line
        ctxEcg.clearRect(targetX, 0, sweepGap, h);
        ctxPleth.clearRect(targetX, 0, sweepGap, h);
        ctxCo2.clearRect(targetX, 0, sweepGap, h);

        // Sweep bar glow
        ctxEcg.fillStyle = 'rgba(34, 197, 94, 0.05)';
        ctxEcg.fillRect(targetX, 0, 2, h);
        ctxPleth.fillStyle = 'rgba(234, 179, 8, 0.05)';
        ctxPleth.fillRect(targetX, 0, 2, h);

        // ECG Pulse & Line
        let ecgY = h / 2;
        if (state.hr > 0) {
            const ecgTimeElapsed = currentTime % beatDurationInSec;
            const ecgPhase = ecgTimeElapsed / beatDurationInSec;

            if (ecgPhase >= 0.18 && ecgPhase < 0.20) {
                const nowMs = Date.now();
                if (nowMs - lastHeartbeatTime > (beatDurationInSec * 800)) {
                    const icon = document.getElementById('heart-beat-icon');
                    icon.style.opacity = '1.0';
                    setTimeout(() => icon.style.opacity = '0.2', 150);
                    triggerPulseSound();
                    lastHeartbeatTime = nowMs;
                }
            }
            const ecgVal = getECGPoint(ecgPhase);
            ecgY = (h / 2) - (ecgVal * h * 0.35);
        }
        ctxEcg.beginPath();
        ctxEcg.strokeStyle = '#22c55e';
        ctxEcg.lineWidth = 2.5;
        ctxEcg.lineCap = 'round';
        ctxEcg.moveTo(targetX - 1, lastEcgY);
        ctxEcg.lineTo(targetX, ecgY);
        ctxEcg.stroke();
        lastEcgY = ecgY;

        // Pleth Line
        let plethY = h * 0.6;
        if (state.hr > 0) {
            const plethPhase = ((currentTime / beatDurationInSec) + plethDelayOffset) % 1.0;
            const plethVal = getPlethPoint(plethPhase);
            plethY = (h * 0.8) - (plethVal * h * 0.55);
        }
        ctxPleth.beginPath();
        ctxPleth.strokeStyle = '#eab308';
        ctxPleth.lineWidth = 2.5;
        ctxPleth.lineCap = 'round';
        ctxPleth.moveTo(targetX - 1, lastPlethY);
        ctxPleth.lineTo(targetX, plethY);
        ctxPleth.stroke();
        lastPlethY = plethY;

        // CO2 Line
        let co2Y = h * 0.85;
        if (state.awrr > 0) {
            const co2TimeElapsed = currentTime % breathDurationInSec;
            const co2Phase = co2TimeElapsed / breathDurationInSec;
            const co2Val = getCO2Point(co2Phase);
            co2Y = (h * 0.85) - (co2Val * h * 0.60);
        }
        ctxCo2.beginPath();
        ctxCo2.strokeStyle = '#ffffff';
        ctxCo2.lineWidth = 2.5;
        ctxCo2.lineCap = 'round';
        ctxCo2.moveTo(targetX - 1, lastCo2Y);
        ctxCo2.lineTo(targetX, co2Y);
        ctxCo2.stroke();
        lastCo2Y = co2Y;

        sweepX = (sweepX + 1) % w;
    }

    // High Priority alarm audio poll (medical MP3 loops)
    if (checkAlarms()) {
        if (state.audioEnabled && !state.alarmsSilenced) {
            const now = Date.now();
            if (!this.lastAlarmBeepTime || now - this.lastAlarmBeepTime > 2500) {
                triggerAlarmSoundSequence();
                this.lastAlarmBeepTime = now;
            }
        }
    }

    requestAnimationFrame(updateAndDraw);
}

// Live parameter display update (numeric) + Dynamic Limits Sync
function syncNumericDisplay() {
    document.getElementById('val-hr').innerText = state.hr;
    document.getElementById('val-pulse').innerText = state.hr;
    document.getElementById('val-spo2').innerText = state.spo2;
    document.getElementById('val-etco2').innerText = state.etco2;
    document.getElementById('val-awrr').innerText = state.awrr;

    document.getElementById('val-nbp').innerText = `${state.bpSys}/${state.bpDia}`;
    const map = Math.round((state.bpSys + (2 * state.bpDia)) / 3);
    document.getElementById('val-nbp-mean').innerText = `(${map})`;

    document.getElementById('val-temp').innerText = state.temp.toFixed(1);

    // Sync text display limits on main screen dynamically
    document.getElementById('disp-limit-hr-max').innerText = limits.hr.max;
    document.getElementById('disp-limit-hr-min').innerText = limits.hr.min;
    document.getElementById('disp-limit-spo2-max').innerText = limits.spo2.max;
    document.getElementById('disp-limit-spo2-min').innerText = limits.spo2.min;
    document.getElementById('disp-limit-etco2-max').innerText = limits.etco2.max;
    document.getElementById('disp-limit-etco2-min').innerText = limits.etco2.min;
    document.getElementById('disp-limit-awrr-max').innerText = limits.awrr.max;
    document.getElementById('disp-limit-awrr-min').innerText = limits.awrr.min;
    document.getElementById('disp-limit-bpsys-max').innerText = limits.bpSys.max;
    document.getElementById('disp-limit-bpdia-min').innerText = limits.bpDia.min;
    document.getElementById('disp-limit-temp-max').innerText = limits.temp.max.toFixed(1);
    document.getElementById('disp-limit-temp-min').innerText = limits.temp.min.toFixed(1);

    // Sync sliders
    document.getElementById('slider-hr').value = state.hr;
    document.getElementById('slider-hr-val').innerText = `${state.hr} /min`;
    document.getElementById('slider-spo2').value = state.spo2;
    document.getElementById('slider-spo2-val').innerText = `${state.spo2} %`;
    document.getElementById('slider-etco2').value = state.etco2;
    document.getElementById('slider-etco2-val').innerText = `${state.etco2} mmHg`;
    document.getElementById('slider-awrr').value = state.awrr;
    document.getElementById('slider-awrr-val').innerText = `${state.awrr} /min`;
    document.getElementById('slider-bpsys').value = state.bpSys;
    document.getElementById('slider-bpsys-val').innerText = `${state.bpSys}`;
    document.getElementById('slider-bpdia').value = state.bpDia;
    document.getElementById('slider-bpdia-val').innerText = `${state.bpDia}`;
    document.getElementById('slider-temp').value = Math.round(state.temp * 10);
    document.getElementById('slider-temp-val').innerText = `${state.temp.toFixed(1)} °F`;

    // Sync inputs inside alarm limits panel
    document.getElementById('input-limit-hr-max').value = limits.hr.max;
    document.getElementById('input-limit-hr-min').value = limits.hr.min;
    document.getElementById('input-limit-spo2-max').value = limits.spo2.max;
    document.getElementById('input-limit-spo2-min').value = limits.spo2.min;
    document.getElementById('input-limit-etco2-max').value = limits.etco2.max;
    document.getElementById('input-limit-etco2-min').value = limits.etco2.min;
    document.getElementById('input-limit-bpsys-max').value = limits.bpSys.max;
    document.getElementById('input-limit-bpdia-min').value = limits.bpDia.min;
}

function updateParamFromSlider(param, val) {
    const num = parseFloat(val);
    if (param === 'hr') state.hr = num;
    else if (param === 'spo2') state.spo2 = num;
    else if (param === 'etco2') state.etco2 = num;
    else if (param === 'awrr') state.awrr = num;
    else if (param === 'bpsys') state.bpSys = num;
    else if (param === 'bpdia') state.bpDia = num;
    else if (param === 'temp') state.temp = num / 10;

    syncNumericDisplay();
}

// Handle alarm parameter input changes
function updateLimitValue(param, type, val) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
        limits[param][type] = num;
        syncNumericDisplay();
    }
}

// Toggle specific alarm parameters on/off
function toggleAlarmSwitch(param, isChecked) {
    limits[param].enabled = isChecked;
    if (param === 'nbp') {
        limits.bpSys.enabled = isChecked;
        limits.bpDia.enabled = isChecked;
    }
    logAlarmEvent('ALARM CFG', `Zmieniono status nasłuchu dla ${param.toUpperCase()}: ${isChecked ? "WŁĄCZONY" : "WYŁĄCZONY"}`);
    syncNumericDisplay();
}

function toggleControlPanel() {
    const panel = document.getElementById('control-panel');
    panel.classList.toggle('translate-x-full');
}

// Change tabs in management panel
function selectPanelTab(tabId) {
    const pTab = document.getElementById('panel-patient-tab');
    const aTab = document.getElementById('panel-alarms-tab');
    const btnP = document.getElementById('btn-tab-patient');
    const btnA = document.getElementById('btn-tab-alarms');

    if (tabId === 'patient-tab') {
        pTab.classList.remove('hidden');
        aTab.classList.add('hidden');
        btnP.className = "flex-1 py-2 text-center border-b-2 border-indigo-500 font-bold text-white";
        btnA.className = "flex-1 py-2 text-center border-b-2 border-transparent text-zinc-400 font-bold hover:text-white";
    } else {
        pTab.classList.add('hidden');
        aTab.classList.remove('hidden');
        btnP.className = "flex-1 py-2 text-center border-b-2 border-transparent text-zinc-400 font-bold hover:text-white";
        btnA.className = "flex-1 py-2 text-center border-b-2 border-indigo-500 font-bold text-white";
    }
}

function loadScenario(type) {
    if (type === 'norm') {
        state.hr = 60;
        state.spo2 = 100;
        state.etco2 = 38;
        state.awrr = 14;
        state.bpSys = 120;
        state.bpDia = 80;
        state.temp = 98.6;
    } else if (type === 'hypotension') {
        state.hr = 119;
        state.spo2 = 99;
        state.etco2 = 36;
        state.awrr = 40;
        state.bpSys = 60;
        state.bpDia = 40;
        state.temp = 99.0;
    } else if (type === 'tachycardia') {
        state.hr = 155;
        state.spo2 = 89;
        state.etco2 = 28;
        state.awrr = 28;
        state.bpSys = 95;
        state.bpDia = 55;
        state.temp = 101.5;
    } else if (type === 'arrest') {
        state.hr = 0;
        state.spo2 = 0;
        state.etco2 = 0;
        state.awrr = 0;
        state.bpSys = 0;
        state.bpDia = 0;
        state.temp = 95.2;
    }
    logAlarmEvent('SCENARIUSZ', `Wczytano gotowy profil: ${type.toUpperCase()}`);
    syncNumericDisplay();
}

function updateDateTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = String(now.getFullYear()).substring(2);

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    const timeString = `${month}/${day}/${year} ${pad(hours)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
    document.getElementById('current-date-time').innerText = timeString;
}

document.getElementById('btn-play-sound').addEventListener('click', () => {
    initAudio();
    state.audioEnabled = !state.audioEnabled;

    const btn = document.getElementById('btn-play-sound');
    const text = document.getElementById('sound-status-text');
    if (state.audioEnabled) {
        btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
        text.innerText = "Wyłącz Dźwięk";
        if (audioCtxFallback && audioCtxFallback.state === 'suspended') {
            audioCtxFallback.resume();
        }
    } else {
        btn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
        btn.classList.remove('bg-red-600', 'hover:bg-red-500');
        text.innerText = "Włącz Dźwięk";
    }
});

document.getElementById('btn-silence').addEventListener('click', () => {
    state.alarmsSilenced = !state.alarmsSilenced;
    const btn = document.getElementById('btn-silence');
    const textSil = document.getElementById('text-silence');
    const iconSil = document.getElementById('icon-silence');
    if (state.alarmsSilenced) {
        btn.classList.remove('bg-yellow-500', 'hover:bg-yellow-400');
        btn.classList.add('bg-zinc-700', 'hover:bg-zinc-600', 'text-red-500');
        textSil.innerText = "Alarm Wyciszony";
        iconSil.innerText = "🔇";
        logAlarmEvent('ALARM SYSTEM', 'Dźwięki alarmów zostały zablokowane ręcznie.');
    } else {
        btn.classList.add('bg-yellow-500', 'hover:bg-yellow-400');
        btn.classList.remove('bg-zinc-700', 'hover:bg-zinc-600', 'text-red-500');
        textSil.innerText = "Wycisz Alarm";
        iconSil.innerText = "🔕";
        logAlarmEvent('ALARM SYSTEM', 'Sygnalizacja dźwiękowa przywrócona.');
    }
});

document.getElementById('btn-nibp').addEventListener('click', () => {
    const bpVal = document.getElementById('val-nbp');
    bpVal.innerText = "---/---";
    logAlarmEvent('NIBP', 'Uruchomiono ręczny pomiar ciśnienia...');
    setTimeout(() => {
        syncNumericDisplay();
        if (state.audioEnabled) {
            audioPulse.play().catch(() => playSyntheticBeep(800, 0.3, 'sine'));
        }
        logAlarmEvent('NIBP', `Zakończono pomiar. Wynik: ${state.bpSys}/${state.bpDia} mmHg`);
    }, 3000);
});

window.onload = function () {
    resizeCanvases();
    syncNumericDisplay();

    lastEcgY = canvasEcg.height / (2 * window.devicePixelRatio);
    lastPlethY = canvasPleth.height / (2 * window.devicePixelRatio);
    lastCo2Y = canvasCo2.height * 0.85 / window.devicePixelRatio;

    requestAnimationFrame(updateAndDraw);
    setInterval(updateDateTime, 1000);
    updateDateTime();
};