// ── Background ────────────────────────────────────────
(function () {
    const container = document.querySelector('.container');
    const canvas    = document.createElement('canvas');
    canvas.id       = 'background';
    container.insertBefore(canvas, container.firstChild);

    const W = container.offsetWidth  || container.clientWidth;
    const H = container.offsetHeight || container.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── Vignette — pre-rendered, applied last ──
    const vigCanvas = document.createElement('canvas');
    vigCanvas.width = W; vigCanvas.height = H;
    const vCtx = vigCanvas.getContext('2d');
    const vig = vCtx.createRadialGradient(W/2, H/2, H * 0.25, W/2, H/2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    vCtx.fillStyle = vig;
    vCtx.fillRect(0, 0, W, H);

    // ── Glare sweep state ──
    let glareX      = -W * 0.5;   // current left edge of the sweep band
    let glareSpeed  = 0;
    let glareActive = false;
    let glareTimer  = 120 + Math.random() * 300;

    function launchGlare() {
        glareX      = -W * 0.35;
        glareSpeed  = W / (55 + Math.random() * 35); // cross screen in ~1.5–2.5 s @60fps
        glareActive = true;
    }

    // ── Floating orbs (slow drifting colour blobs) ──
    const orbs = [
        { cx: W * 0.15, cy: H * 0.5,  r: H * 1.1, hue: 220, sat: 80, vy:  0.06, vx: 0.04, phase: 0.0  },
        { cx: W * 0.55, cy: H * 0.3,  r: H * 0.9, hue: 195, sat: 90, vy: -0.05, vx: 0.03, phase: 1.2  },
        { cx: W * 0.80, cy: H * 0.6,  r: H * 1.0, hue: 260, sat: 70, vy:  0.04, vx:-0.05, phase: 2.5  },
        { cx: W * 0.35, cy: H * 0.8,  r: H * 0.7, hue: 185, sat: 85, vy: -0.03, vx: 0.06, phase: 0.8  },
    ];

    // ── Terminal rain columns ──
    const FONT_H  = 14;
    const FONT_W  = 8;
    const COLS    = Math.floor(W / FONT_W);
    const ROWS    = Math.floor(H / FONT_H);
    const CHARS   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>{}[]|/\\=+-_:;.,?!@#$%^&*()';

    // Each column: y position (in rows), speed (rows/sec), and its character strip
    const cols = Array.from({ length: COLS }, (_, i) => ({
        x:       i * FONT_W,
        y:      -Math.floor(Math.random() * ROWS * 2),  // stagger start
        speed:   2 + Math.random() * 4,                   // rows per second
        chars:   Array.from({ length: ROWS + 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        mutateAt: Math.floor(Math.random() * 60),
    }));

    // Pre-render the text layer into an offscreen canvas, updated at ~12fps
    const textCanvas = document.createElement('canvas');
    textCanvas.width  = W;
    textCanvas.height = H;
    const tCtx = textCanvas.getContext('2d');
    tCtx.font = `${FONT_H}px monospace`;
    tCtx.textBaseline = 'top';

    let textTick  = 0;
    let lastTextT = 0;

    function updateText(t, dt) {
        textTick++;
        // Update at ~12 fps to keep it cheap
        if (textTick % 5 !== 0) return;

        tCtx.clearRect(0, 0, W, H);

        for (const col of cols) {
            // Advance position
            col.y += col.speed * dt;
            if (col.y > ROWS * 2) {
                col.y = -Math.floor(Math.random() * ROWS);
                col.speed = 2 + Math.random() * 4;
                col.chars = Array.from({ length: ROWS + 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]);
            }
            // Occasionally mutate a random character in the strip
            col.mutateAt--;
            if (col.mutateAt <= 0) {
                const idx = Math.floor(Math.random() * col.chars.length);
                col.chars[idx] = CHARS[Math.floor(Math.random() * CHARS.length)];
                col.mutateAt = 8 + Math.floor(Math.random() * 30);
            }

            const headRow = Math.floor(col.y);
            for (let r = 0; r < ROWS; r++) {
                const charIdx = headRow - r;
                if (charIdx < 0 || charIdx >= col.chars.length) continue;
                // Fade: chars near the head are brighter
                const dist = headRow - r;
                const fade = Math.max(0, 1 - dist / 18);
                if (fade < 0.04) continue;
                const alpha = fade * 0.22;  // max ~22% opacity
                tCtx.fillStyle = `rgba(140,200,255,${alpha.toFixed(3)})`;
                tCtx.fillText(col.chars[charIdx], col.x, r * FONT_H);
            }
        }
    }

    let last = 0;
    function draw(ts) {
        const dt = Math.min((ts - last) / 1000, 0.05);
        last = ts;
        const t = ts * 0.001;

        ctx.clearRect(0, 0, W, H);

        // ── Plasma orbs ──
        for (const o of orbs) {
            // Gently drift using sinusoidal motion
            const cx = o.cx + Math.sin(t * o.vx + o.phase) * W * 0.12;
            const cy = o.cy + Math.sin(t * o.vy + o.phase * 1.3) * H * 0.25;
            // Slowly rotate hue
            const hue = (o.hue + t * 4) % 360;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r);
            grad.addColorStop(0,   `hsla(${hue},${o.sat}%,38%,0.55)`);
            grad.addColorStop(0.5, `hsla(${hue},${o.sat}%,22%,0.25)`);
            grad.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // ── Subtle horizontal banding (depth / LCD backlighting feel) ──
        const bandGrad = ctx.createLinearGradient(0, 0, 0, H);
        bandGrad.addColorStop(0,   'rgba(255,255,255,0.03)');
        bandGrad.addColorStop(0.5, 'rgba(255,255,255,0.07)');
        bandGrad.addColorStop(1,   'rgba(255,255,255,0.02)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, 0, W, H);

        // ── Glare sweep ──
        if (!glareActive) {
            glareTimer -= dt * 60;
            if (glareTimer <= 0) {
                launchGlare();
                glareTimer = 180 + Math.random() * 400;
            }
        } else {
            glareX += glareSpeed;
            const bw = W * 0.32;
            const glareGrad = ctx.createLinearGradient(glareX, 0, glareX + bw, 0);
            glareGrad.addColorStop(0,    'rgba(255,255,255,0)');
            glareGrad.addColorStop(0.3,  'rgba(255,255,255,0.07)');
            glareGrad.addColorStop(0.5,  'rgba(255,255,255,0.13)');
            glareGrad.addColorStop(0.7,  'rgba(255,255,255,0.07)');
            glareGrad.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = glareGrad;
            // Slight diagonal tilt: narrow strip from top to bottom offset
            ctx.save();
            ctx.transform(1, 0, -0.15, 1, 0, 0);
            ctx.fillRect(glareX, 0, bw, H);
            ctx.restore();
            if (glareX > W * 1.1) glareActive = false;
        }

        // ── Terminal rain (very faint) ──
        updateText(t, dt);
        ctx.drawImage(textCanvas, 0, 0);

        // ── Vignette ──
        ctx.drawImage(vigCanvas, 0, 0);

        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
})();

// ── Name auto-fit ─────────────────────────────────────
function fitName(el, maxRem = 6.5, minRem = 2.0) {
    // Use a Range to measure actual text width (element.getBoundingClientRect
    // stretches to fill the line for inline elements inside a block container).
    // maxPx = width of the .name h1 (direct parent), which already accounts
    // for the .identity padding — no need to subtract it separately.
    const maxPx = el.parentElement.clientWidth;
    const range = document.createRange();
    range.selectNodeContents(el);

    let size = maxRem;
    el.style.fontSize = size + 'rem';
    while (range.getBoundingClientRect().width > maxPx && size > minRem) {
        size = Math.round((size - 0.1) * 10) / 10;
        el.style.fontSize = size + 'rem';
    }
}

// ── Status display ────────────────────────────────────
const STATUS_GLOW_COLOR = {
    available: '#22c55e',
    busy:      '#ef4444',
    away:      '#f59e0b',
    oof:       '#a855f7',
};

function setStatus(availability, workLocation, outOfOffice) {
    const text = document.getElementById('status-text');
    const glow = document.getElementById('status-glow');

    text.className = 'status-label';

    // OOF takes precedence over whatever availability reports
    if (outOfOffice) {
        text.classList.add('oof');
        text.textContent = 'Out of Office';
        glow.style.background = STATUS_GLOW_COLOR['oof'];
        document.getElementById('free-after').style.display = 'none';
        return;
    }

    let label   = 'Offline';
    let glowKey = 'away';
    let showRemote = false;

    switch (availability) {
        case 'Available':
            text.classList.add('available');
            label   = 'Available';
            glowKey = 'available';
            showRemote = true;
            break;
        case 'Busy':
        case 'DoNotDisturb':
            text.classList.add('busy');
            label   = availability === 'DoNotDisturb' ? 'Do Not Disturb' : 'In a Meeting';
            glowKey = 'busy';
            showRemote = true;
            break;
        case 'BeRightBack':
            text.classList.add('away');
            label = 'Be Right Back';
            showRemote = true;
            break;
        // Note: OutOfOffice is handled above via the outOfOffice flag — never reaches here
        case 'Away':
            text.classList.add('away');
            label = 'Away';
            showRemote = true;
            break;
        case 'Offline':
        case 'PresenceUnknown':
        default:
            text.classList.add('away');
            label = 'Offline';
    }

    const isRemote = showRemote && workLocation === 'remote';
    text.innerHTML = isRemote
        ? `${label}<span class="remote-badge">Remote</span>`
        : label;

    glow.style.background = STATUS_GLOW_COLOR[glowKey];
}

// ── API polling ───────────────────────────────────────
async function fetchStatus() {
    try {
        const res  = await fetch('/api/status/' + window.PYPILLAR_USERNAME);
        const data = await res.json();

        if (data.company) {
            document.getElementById('company-name').textContent = data.company;
        }

        if (data.profile) {
            const elFirst = document.getElementById('name-first');
            const elLast  = document.getElementById('name-last');
            elFirst.textContent = data.profile.firstName;
            elLast.textContent  = data.profile.lastName;
            document.getElementById('title').textContent = data.profile.title;
            // Wait for webfonts before measuring so Oswald is used, not the fallback
            document.fonts.ready.then(() => {
                fitName(elFirst);
                fitName(elLast);
                // Both lines use the smaller of the two fitted sizes so neither dwarfs the other
                const fittedRem = Math.min(
                    parseFloat(elFirst.style.fontSize),
                    parseFloat(elLast.style.fontSize)
                );
                elFirst.style.fontSize = fittedRem + 'rem';
                elLast.style.fontSize  = fittedRem + 'rem';
                // Set h1 font-size to the fitted size so em-based padding scales with the text
                elFirst.parentElement.style.fontSize = fittedRem + 'rem';
            });
        }

        setStatus(data.presence, data.workLocation, data.outOfOffice);

        const freeAfterEl   = document.getElementById('free-after');
        const freeAfterTime = document.getElementById('free-after-time');
        if (data.freeAfter && !data.outOfOffice) {
            freeAfterTime.textContent = data.freeAfter;
            freeAfterEl.style.display = 'flex';
        } else {
            freeAfterEl.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to fetch status:', e);
    }
}

// Poll quickly until profile data arrives, then settle into normal 30s interval
let _slowTimer = null;
async function fetchStatusAndSettle() {
    await fetchStatus();
    const ready = !!document.getElementById('name-first').textContent;
    if (ready && !_slowTimer) {
        _slowTimer = setInterval(fetchStatus, 30_000);
    } else if (!ready) {
        setTimeout(fetchStatusAndSettle, 2_000);
    }
}
fetchStatusAndSettle();

// ── Clock ──────────────────────────────────────────────
function updateClock() {
    const now     = new Date();
    const hours   = now.getHours();
    const h       = hours % 12 || 12;
    const m       = String(now.getMinutes()).padStart(2, '0');
    const ampm    = hours >= 12 ? ' PM' : ' AM';

    document.getElementById('clock-h').textContent    = h;
    document.getElementById('clock-m').textContent    = m;
    document.getElementById('clock-ampm').textContent = ampm;

    document.getElementById('clock-date').textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month:   'long',
        day:     'numeric'
    });
}

updateClock();
setInterval(updateClock, 1000);

