// ── Background ────────────────────────────────────────
(function () {
    const bg = window.PYPILLAR_BACKGROUND;
    if (!bg) return;

    const container = document.querySelector('.container');
    const canvas    = document.createElement('canvas');
    canvas.id       = 'background';
    container.insertBefore(canvas, container.firstChild);

    const W = container.offsetWidth  || container.clientWidth;
    const H = container.offsetHeight || container.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── Shared: vignette pre-rendered ──
    function makeVignette(inner = 0.25, outer = 0.9, alpha = 0.65) {
        const vc = document.createElement('canvas');
        vc.width = W; vc.height = H;
        const vx = vc.getContext('2d');
        const g  = vx.createRadialGradient(W/2, H/2, H * inner, W/2, H/2, H * outer);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${alpha})`);
        vx.fillStyle = g;
        vx.fillRect(0, 0, W, H);
        return vc;
    }

    // ════════════════════════════════════════════════════
    // Effect: matrix / matrix-aurora
    // ════════════════════════════════════════════════════
    function runMatrix(aurora) {
        const vigCanvas = makeVignette();

        const orbs = aurora ? [
            { cx: W * 0.15, cy: H * 0.5,  r: H * 1.1, hue: 220, sat: 80, vy:  0.06, vx: 0.04, phase: 0.0 },
            { cx: W * 0.55, cy: H * 0.3,  r: H * 0.9, hue: 195, sat: 90, vy: -0.05, vx: 0.03, phase: 1.2 },
            { cx: W * 0.80, cy: H * 0.6,  r: H * 1.0, hue: 260, sat: 70, vy:  0.04, vx:-0.05, phase: 2.5 },
            { cx: W * 0.35, cy: H * 0.8,  r: H * 0.7, hue: 185, sat: 85, vy: -0.03, vx: 0.06, phase: 0.8 },
        ] : [];

        const FONT_H = 14, FONT_W = 8;
        const COLS   = Math.floor(W / FONT_W);
        const ROWS   = Math.floor(H / FONT_H);
        const CHARS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>{}[]|/\\=+-_:;.,?!@#$%^&*()';

        const cols = Array.from({ length: COLS }, (_, i) => ({
            x:        i * FONT_W,
            y:       -Math.floor(Math.random() * ROWS * 2),
            speed:    2 + Math.random() * 4,
            chars:    Array.from({ length: ROWS + 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
            mutateAt: Math.floor(Math.random() * 60),
        }));

        const textCanvas = document.createElement('canvas');
        textCanvas.width = W; textCanvas.height = H;
        const tCtx = textCanvas.getContext('2d');
        tCtx.font = `${FONT_H}px monospace`;
        tCtx.textBaseline = 'top';

        let textTick = 0;
        function updateText(dt) {
            textTick++;
            if (textTick % 5 !== 0) return;
            tCtx.clearRect(0, 0, W, H);
            for (const col of cols) {
                col.y += col.speed * dt;
                if (col.y > ROWS * 2) {
                    col.y = -Math.floor(Math.random() * ROWS);
                    col.speed = 2 + Math.random() * 4;
                    col.chars = Array.from({ length: ROWS + 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]);
                }
                col.mutateAt--;
                if (col.mutateAt <= 0) {
                    col.chars[Math.floor(Math.random() * col.chars.length)] = CHARS[Math.floor(Math.random() * CHARS.length)];
                    col.mutateAt = 8 + Math.floor(Math.random() * 30);
                }
                const headRow = Math.floor(col.y);
                for (let r = 0; r < ROWS; r++) {
                    const ci = headRow - r;
                    if (ci < 0 || ci >= col.chars.length) continue;
                    const fade = Math.max(0, 1 - (headRow - r) / 18);
                    if (fade < 0.04) continue;
                    tCtx.fillStyle = `rgba(140,200,255,${(fade * 0.22).toFixed(3)})`;
                    tCtx.fillText(col.chars[ci], col.x, r * FONT_H);
                }
            }
        }

        let last = 0;
        function draw(ts) {
            const dt = Math.min((ts - last) / 1000, 0.05);
            last = ts;
            const t  = ts * 0.001;
            ctx.clearRect(0, 0, W, H);
            for (const o of orbs) {
                const cx  = o.cx + Math.sin(t * o.vx + o.phase) * W * 0.12;
                const cy  = o.cy + Math.sin(t * o.vy + o.phase * 1.3) * H * 0.25;
                const hue = (o.hue + t * 4) % 360;
                const gr  = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r);
                gr.addColorStop(0,   `hsla(${hue},${o.sat}%,38%,0.55)`);
                gr.addColorStop(0.5, `hsla(${hue},${o.sat}%,22%,0.25)`);
                gr.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = gr;
                ctx.fillRect(0, 0, W, H);
            }
            if (aurora) {
                const bg2 = ctx.createLinearGradient(0, 0, 0, H);
                bg2.addColorStop(0,   'rgba(255,255,255,0.03)');
                bg2.addColorStop(0.5, 'rgba(255,255,255,0.07)');
                bg2.addColorStop(1,   'rgba(255,255,255,0.02)');
                ctx.fillStyle = bg2;
                ctx.fillRect(0, 0, W, H);
            }
            updateText(dt);
            ctx.drawImage(textCanvas, 0, 0);
            ctx.drawImage(vigCanvas, 0, 0);
            requestAnimationFrame(draw);
        }
        requestAnimationFrame(draw);
    }

    // ════════════════════════════════════════════════════
    // Effect: snow
    // ════════════════════════════════════════════════════
    function runSnow() {
        const vigCanvas = makeVignette(0.3, 1.0, 0.5);

        const flakes = Array.from({ length: 180 }, () => ({
            x:     Math.random() * W,
            y:     Math.random() * H,
            r:     0.8 + Math.random() * 3.2,       // 0.8 – 4 px radius
            speed: 18 + Math.random() * 45,          // px/sec fall speed
            drift: (Math.random() - 0.5) * 12,       // horizontal sway amplitude
            phase: Math.random() * Math.PI * 2,      // sway phase offset
            alpha: 0.15 + Math.random() * 0.55,      // base opacity
        }));

        let last = 0;
        function draw(ts) {
            const dt = Math.min((ts - last) / 1000, 0.05);
            last = ts;
            const t = ts * 0.001;

            ctx.clearRect(0, 0, W, H);

            for (const f of flakes) {
                f.y += f.speed * dt;
                f.x += Math.sin(t * 0.6 + f.phase) * f.drift * dt;

                // Wrap around
                if (f.y > H + f.r)  { f.y = -f.r;  f.x = Math.random() * W; }
                if (f.x > W + f.r)  f.x = -f.r;
                if (f.x < -f.r)     f.x = W + f.r;

                // Soft-edged dot via radial gradient
                const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                gr.addColorStop(0,   `rgba(255,255,255,${f.alpha.toFixed(2)})`);
                gr.addColorStop(0.5, `rgba(220,235,255,${(f.alpha * 0.5).toFixed(2)})`);
                gr.addColorStop(1,   'rgba(200,220,255,0)');
                ctx.fillStyle = gr;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.drawImage(vigCanvas, 0, 0);
            requestAnimationFrame(draw);
        }
        requestAnimationFrame(draw);
    }

    // ── Dispatch ──
    if      (bg === 'matrix')        runMatrix(false);
    else if (bg === 'matrix-aurora') runMatrix(true);
    else if (bg === 'snow')          runSnow();
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

