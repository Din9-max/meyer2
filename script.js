const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const silhouetteImg = document.getElementById('silhouette');
const timerDiv = document.getElementById('timer');
const levelIndicator = document.getElementById('levelIndicator');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

// Кнопки
const startBtn = document.getElementById('startBtn');
const retryLevelBtn = document.getElementById('retryLevelBtn'); // НОВОЕ
const restartGameBtn = document.getElementById('restartGameBtn'); // НОВОЕ

// --- АУДИО ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(f, d, t = 'sine') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = t;
    osc.frequency.setValueAtTime(f, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + d);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + d);
}

// --- УРОВНИ ---
const levels = [
    { image: "pose1.png", timeAllowed: 20, checkPose: (pts) => { const bodyScale = (dist(pts[11], pts[12]) + dist(pts[23], pts[24])) / 2; return pts[15].y < pts[11].y && Math.abs(pts[15].x - pts[11].x) < bodyScale * 0.5 && pts[16].y > pts[24].y; } },
    { image: "pose6.png", timeAllowed: 18, checkPose: (pts) => { const torso = dist(pts[11], pts[23]); const avgS = (pts[11].y + pts[12].y) / 2, avgH = (pts[23].y + pts[24].y) / 2; return Math.abs(avgH - avgS) < torso * 0.7 && Math.max(pts[15].y, pts[16].y) > avgH; } },
    { image: "pose3.png", timeAllowed: 15, checkPose: (pts) => { const bodyScale = (dist(pts[11], pts[12]) + dist(pts[23], pts[24])) / 2; return dist(pts[16], pts[24]) < bodyScale * 0.7 && Math.abs(pts[15].x - pts[11].x) > bodyScale * 0.8; } },
    { image: "pose4.png", timeAllowed: 15, checkPose: (pts) => { const torso = dist(pts[11], pts[23]); return dist(pts[15], pts[16]) > torso * 1.2 && Math.abs(pts[11].x - pts[23].x) > torso * 0.3; } },
    { image: "pose5.png", timeAllowed: 12, checkPose: (pts) => { const torso = dist(pts[11], pts[23]); return pts[16].y < (pts[12].y - torso * 0.4) && Math.abs((pts[11].x+pts[12].x)/2 - (pts[23].x+pts[24].x)/2) > torso * 0.25; } }
];

function dist(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }

// --- ЛОГИКА ИГРЫ ---
let currentLevelIndex = 0, timeLeft = 0, timerInterval, isGameOver = false, gameStarted = false;

function startLevel(index) {
    if (index >= levels.length) {
        clearInterval(timerInterval);
        timerDiv.innerText = "--";
        levelIndicator.innerText = "ПОБЕДА!";
        isGameOver = true;
        
        playBeep(500, 0.2);
        setTimeout(() => playBeep(650, 0.2), 200);
        setTimeout(() => playBeep(800, 0.4), 400);
        return;
    }
    
    currentLevelIndex = index;
    silhouetteImg.src = levels[index].image;
    timeLeft = levels[index].timeAllowed;
    levelIndicator.style.opacity = '1';
    levelIndicator.innerText = `Уровень ${index + 1} из ${levels.length}`;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--; timerDiv.innerText = timeLeft;
        if (timeLeft <= 5) { timerDiv.classList.add('danger'); playBeep(600, 0.1, 'triangle'); }
        else { timerDiv.classList.remove('danger'); playBeep(400, 0.05); }
        if (timeLeft <= 0) loseGame();
    }, 1000);
}

function loseGame() {
    isGameOver = true; clearInterval(timerInterval);
    playBeep(150, 0.5, 'sawtooth');
    gameOverScreen.classList.remove('hidden');
}

// --- ОБРАБОТЧИКИ КНОПОК ---
startBtn.onclick = () => { 
    startScreen.classList.add('hidden'); 
    gameStarted = true; 
    startLevel(0); 
};

// Кнопка 1: Попробовать текущую позу снова
retryLevelBtn.onclick = () => {
    gameOverScreen.classList.add('hidden');
    isGameOver = false;
    startLevel(currentLevelIndex); // Запускаем уровень с текущим индексом
};

// Кнопка 2: Начать вообще заново
restartGameBtn.onclick = () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden'); // Показываем стартовое окно
    isGameOver = true; // Игра в режиме ожидания старта
    gameStarted = false;
};

// --- НЕЙРОСЕТЬ ---
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5 });

pose.onResults((results) => {
    if (canvasElement.width !== window.innerWidth) {
        canvasElement.width = window.innerWidth; canvasElement.height = window.innerHeight;
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    let vR = results.image.width / results.image.height, cR = canvasElement.width / canvasElement.height;
    let sw = vR > cR ? results.image.height * cR : results.image.width;
    let sh = vR > cR ? results.image.height : results.image.width / cR;
    canvasCtx.drawImage(results.image, (results.image.width-sw)/2, (results.image.height-sh)/2, sw, sh, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    if (gameStarted && !isGameOver && results.poseLandmarks) {
        const pts = results.poseLandmarks;
        
        if (pts[11].visibility > 0.6 && pts[27].visibility > 0.6) {
            let pHeight = Math.abs(pts[27].y - pts[11].y) * window.innerHeight;
            silhouetteImg.style.height = (pHeight * 1.5) + "px";
        }

        if (levels[currentLevelIndex].checkPose(pts)) {
            clearInterval(timerInterval);
            
            silhouetteImg.style.filter = "drop-shadow(0 0 30px #27ae60) brightness(1.5)";
            silhouetteImg.style.opacity = "0.8";
            playBeep(800, 0.2);
            
            setTimeout(() => {
                silhouetteImg.style.filter = "drop-shadow(0 0 10px rgba(255,255,255,0.5))";
                silhouetteImg.style.opacity = "0.35";
                startLevel(currentLevelIndex + 1);
            }, 600);
        }
    }
});

const camera = new Camera(videoElement, { onFrame: async () => { await pose.send({image: videoElement}); } });
camera.start();
