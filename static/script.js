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
};

function setStatus(availability, workLocation) {
    const text = document.getElementById('status-text');
    const glow = document.getElementById('status-glow');

    text.className = 'status-label';

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
        case 'OutOfOffice':
            text.classList.add('away');
            label = 'Out of Office';
            break;
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

        if (data.presence) {
            setStatus(data.presence, data.workLocation);
        }

        const freeAfterEl   = document.getElementById('free-after');
        const freeAfterTime = document.getElementById('free-after-time');
        if (data.freeAfter) {
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

