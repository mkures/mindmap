/**
 * Lightweight emoji picker — no dependencies
 * Usage: openEmojiPicker(x, y, onSelect)
 */

const EMOJI_CATEGORIES = [
    { name: 'Fréquents', icon: '🕐', emojis: ['⭐','✅','❌','⚠️','💡','🔥','❤️','👍','👎','🎯','📌','🚀','💬','📝','🔗','✏️','📎','🏷️','📊','📈'] },
    { name: 'Visages', icon: '😀', emojis: ['😀','😊','🤔','😎','🥳','😍','😂','🤩','😤','😱','🙄','😴','🤯','🫡','😇','🤓','😬','🫠','🥲','😈'] },
    { name: 'Gestes', icon: '👋', emojis: ['👋','👍','👎','👏','🤝','✋','🤞','💪','🙏','✌️','🤟','👆','👇','👈','👉','☝️','🫵','🤙','✍️','🫶'] },
    { name: 'Objets', icon: '💼', emojis: ['💼','📁','📂','📋','📌','📎','🔗','📝','✏️','🖊️','📐','📏','🗂️','🗃️','🗄️','📦','🏷️','💾','💿','🖥️'] },
    { name: 'Symboles', icon: '⚡', emojis: ['⚡','✨','💫','⭐','🌟','❗','❓','‼️','⁉️','✅','❌','⛔','🚫','♻️','🔴','🟢','🔵','🟡','🟠','🟣'] },
    { name: 'Nature', icon: '🌿', emojis: ['🌿','🌱','🌳','🍀','🌸','🌻','🌈','☀️','🌙','⚡','🔥','💧','❄️','🌊','🍂','🌾','🏔️','🌍','🦋','🐝'] },
    { name: 'Nourriture', icon: '🍕', emojis: ['☕','🍕','🍔','🎂','🍎','🍊','🥑','🍷','🍺','🧁','🍩','🥐','🫖','🍿','🥗','🍣','🌮','🥤','🧃','🍪'] },
    { name: 'Activités', icon: '🎮', emojis: ['🎮','🎯','🎨','🎬','🎵','🎸','📸','🏆','🥇','🎪','🎭','🧩','♟️','🎲','🎳','⚽','🏀','🎾','🏓','🛹'] },
    { name: 'Transport', icon: '🚗', emojis: ['🚗','✈️','🚀','🚂','🚢','🏠','🏢','🏗️','🏭','🏫','🏥','⛪','🗼','🌉','🚦','🛤️','⛽','🅿️','🚧','🗺️'] },
    { name: 'Drapeaux', icon: '🏁', emojis: ['🏁','🚩','🎌','🏳️','🏴','🇫🇷','🇬🇧','🇺🇸','🇩🇪','🇪🇸','🇮🇹','🇯🇵','🇨🇳','🇰🇷','🇧🇷','🇨🇦','🇦🇺','🇮🇳','🇷🇺','🇲🇽'] },
];

let _picker = null;
let _outsideHandler = null;

export function openEmojiPicker(x, y, onSelect) {
    closeEmojiPicker();

    _picker = document.createElement('div');
    _picker.className = 'emoji-picker';

    // Search bar
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'emoji-picker-search';
    search.placeholder = 'Rechercher…';
    _picker.appendChild(search);

    // Category tabs
    const tabs = document.createElement('div');
    tabs.className = 'emoji-picker-tabs';
    EMOJI_CATEGORIES.forEach((cat, i) => {
        const tab = document.createElement('span');
        tab.className = 'emoji-picker-tab' + (i === 0 ? ' active' : '');
        tab.textContent = cat.icon;
        tab.title = cat.name;
        tab.addEventListener('click', () => {
            tabs.querySelectorAll('.emoji-picker-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderCategory(i);
            search.value = '';
        });
        tabs.appendChild(tab);
    });
    _picker.appendChild(tabs);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'emoji-picker-grid';
    _picker.appendChild(grid);

    function renderCategory(idx) {
        grid.innerHTML = '';
        const cat = EMOJI_CATEGORIES[idx];
        cat.emojis.forEach(emoji => {
            const btn = document.createElement('span');
            btn.className = 'emoji-picker-emoji';
            btn.textContent = emoji;
            btn.addEventListener('click', () => {
                closeEmojiPicker();
                onSelect(emoji);
            });
            grid.appendChild(btn);
        });
    }

    function renderSearch(query) {
        grid.innerHTML = '';
        const q = query.toLowerCase();
        // Simple: show all emojis that match visually (search across all categories)
        EMOJI_CATEGORIES.forEach(cat => {
            cat.emojis.forEach(emoji => {
                // For text search, match category name
                if (cat.name.toLowerCase().includes(q)) {
                    const btn = document.createElement('span');
                    btn.className = 'emoji-picker-emoji';
                    btn.textContent = emoji;
                    btn.addEventListener('click', () => {
                        closeEmojiPicker();
                        onSelect(emoji);
                    });
                    grid.appendChild(btn);
                }
            });
        });
    }

    search.addEventListener('input', () => {
        if (search.value.trim()) {
            tabs.querySelectorAll('.emoji-picker-tab').forEach(t => t.classList.remove('active'));
            renderSearch(search.value.trim());
        } else {
            tabs.querySelector('.emoji-picker-tab')?.classList.add('active');
            renderCategory(0);
        }
    });

    renderCategory(0);

    // Position
    _picker.style.left = Math.min(x, window.innerWidth - 320) + 'px';
    _picker.style.top = Math.min(y, window.innerHeight - 380) + 'px';
    document.body.appendChild(_picker);
    search.focus();

    // Close on outside click
    setTimeout(() => {
        _outsideHandler = e => {
            if (_picker && !_picker.contains(e.target)) closeEmojiPicker();
        };
        document.addEventListener('mousedown', _outsideHandler);
    }, 0);
}

export function closeEmojiPicker() {
    if (_picker) { _picker.remove(); _picker = null; }
    if (_outsideHandler) { document.removeEventListener('mousedown', _outsideHandler); _outsideHandler = null; }
}
