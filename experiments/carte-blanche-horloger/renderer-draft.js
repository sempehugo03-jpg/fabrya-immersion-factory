const canvas = document.getElementById('fabrya-stage');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function loadAsset(path) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = path;
    });
}

async function drawWatch(clockType, material, bracelet, color) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const watchImg = await loadAsset('watch.webp');

    let watchX = (canvas.width - watchImg.width) / 2;
    let watchY = (canvas.height - watchImg.height) / 2;

    if (clockType === 'mechanique') {
        watchX += 50;
    }

    if (material === 'or') {
        watchY -= 30;
    }

    if (bracelet === 'or') {
        watchX += 10;
    }

    if (color === 'rouge') {
        watchY -= 10;
    }

    ctx.drawImage(watchImg, watchX, watchY);
}

function updateStatus() {
    document.getElementById('fabrya-status').textContent = 'Démonstration fictive';
}

document.addEventListener('DOMContentLoaded', () => {
    drawWatch('quartz', 'acier', 'non', 'noir');
    updateStatus();
});

const controls = document.querySelectorAll('.control select');
controls.forEach(control => {
    control.addEventListener('change', () => {
        const clockType = document.querySelector('#ctrl-clockType').value;
        const material = document.querySelector('#ctrl-material').value;
        const bracelet = document.querySelector('#ctrl-bracelet').value;
        const color = document.querySelector('#ctrl-color').value;
        drawWatch(clockType, material, bracelet, color);
    });
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawWatch(document.querySelector('#ctrl-clockType').value,
               document.querySelector('#ctrl-material').value,
               document.querySelector('#ctrl-bracelet').value,
               document.querySelector('#ctrl-color').value);
});
