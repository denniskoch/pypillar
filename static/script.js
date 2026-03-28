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
        const res  = await fetch('/api/status');
        const data = await res.json();

        if (data.company) {
            document.getElementById('company-name').textContent = data.company;
        }

        if (data.profile) {
            document.getElementById('name-first').textContent = data.profile.firstName;
            document.getElementById('name-last').textContent  = data.profile.lastName;
            document.getElementById('title').textContent      = data.profile.title;
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

fetchStatus();
setInterval(fetchStatus, 30_000);

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

// ── IT Facts ───────────────────────────────────────────
let IT_FACTS = [];
let factIndex = 0;

function showFact() {
    if (!IT_FACTS.length) return;
    const el = document.getElementById('fact-text');

    // slide + fade out downward
    el.style.opacity   = '0';
    el.style.transform = 'translateY(14px)';

    setTimeout(() => {
        factIndex      = (factIndex + 1) % IT_FACTS.length;
        el.textContent = IT_FACTS[factIndex];

        // snap above, no transition
        el.style.transition = 'none';
        el.style.transform  = 'translateY(-14px)';
        el.style.opacity    = '0';

        // force reflow so the snap is applied before re-enabling transition
        el.getBoundingClientRect();

        // slide + fade in upward
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        el.style.transform  = 'translateY(0)';
        el.style.opacity    = '1';
    }, 500);
}

async function loadFacts() {
    try {
        const res = await fetch('/facts.json');
        IT_FACTS = await res.json();
        factIndex = Math.floor(Math.random() * IT_FACTS.length);
        document.getElementById('fact-text').textContent = IT_FACTS[factIndex];
        setInterval(showFact, 12_000);
    } catch (e) {
        console.error('Failed to load facts:', e);
    }
}

loadFacts();
