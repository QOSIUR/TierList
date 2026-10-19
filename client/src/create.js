// ---------- 1. СОСТОЯНИЕ (источник правды) ----------
// Всё, что видно на экране, берётся отсюда. DOM только рисуется по этим данным.
const STORAGE_KEY = 'tierlist-v2';

// Цвета новых тиров берутся по кругу из этого списка (цвета из дизайна).
// Потом цвет любого тира можно поменять кликом по его цветной плашке.
const DEFAULT_COLORS = ['#e2787a', '#e6a15e', '#d9c766', '#7fc58a', '#6fa8dc'];

const DEFAULT_TITLE = 'Мой tier list'; // заголовок страницы, пока пользователь не придумал свой

// Иконка корзины для кнопки «Удалить ряд» (статичная разметка, пользовательских данных в ней нет)
const TRASH_ICON = '<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16ZM96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Zm48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Z"></path></svg>';

function defaultState() {
  return {
    title: DEFAULT_TITLE, // заголовок страницы (редактируется кликом)
    tiers: [],    // [{ id, name, color, items: [id картинок] }] — тиры создаёт сам пользователь
    pool: [],     // id картинок, которые ещё не разложены по тирам
    images: {},   // id -> dataURL картинки
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // подмешиваем значения по умолчанию: в старых сохранениях может не быть новых полей (например, title)
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) { /* битые данные — начнём с чистого */ }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('Не хватило места в localStorage — часть данных не сохранится.');
  }
}

let state = load();
let dragId = null;      // id картинки, которую сейчас тащим
let focusTierId = null; // только что созданный тир: сразу начинаем править его название

function uid() { return Math.random().toString(36).slice(2, 9); }

// ---------- 2. ОПЕРАЦИИ НАД ДАННЫМИ ----------
function getList(zoneId) {
  if (zoneId === 'pool') return state.pool;
  return state.tiers.find(t => t.id === zoneId).items;
}

function removeFromLists(id) {
  [state.pool, ...state.tiers.map(t => t.items)].forEach(list => {
    const i = list.indexOf(id);
    if (i !== -1) list.splice(i, 1);
  });
}

// ---------- 3. ВСПОМОГАТЕЛЬНОЕ ДЛЯ ТИРОВ ----------
// Цвет текста на плашке: тёмный на светлом фоне, светлый на тёмном (по яркости цвета).
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? 'var(--color-bg)' : 'var(--color-neutral-100)';
}

// Цвет плашки задаётся через CSS-переменные, а сами правила лежат в create.css
function paintLabel(label, color) {
  label.style.setProperty('--tier-bg', color);
  label.style.setProperty('--tier-ink', inkFor(color));
}

// Чем длиннее название, тем мельче шрифт, чтобы оно помещалось в плашку
function fitName(el) {
  const len = el.textContent.length;
  el.style.fontSize = len <= 2 ? '32px' : len <= 4 ? '22px' : '15px';
}

// Делает элемент редактируемым «на месте»: клик — правим текст, Enter или клик мимо — сохраняем.
// Основа — атрибут contenteditable: он превращает обычный div/h1 в поле ввода.
// Используется и для заголовка страницы, и для названий тиров.
function makeEditable(el, { value, fallback, onInput, onSave }) {
  el.contentEditable = 'true';
  el.spellcheck = false;
  el.textContent = value;

  if (onInput) el.addEventListener('input', onInput);

  el.addEventListener('blur', () => {
    const text = el.textContent.trim() || fallback; // пустое значение не сохраняем
    el.textContent = text;                          // заодно убираем лишнюю разметку, если вставили из буфера
    onSave(text);
  });

  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); } // Enter завершает редактирование
  });
}

// ---------- 4. ОТРИСОВКА: render(state) ----------
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  if (state.tiers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    empty.textContent = 'Пока нет ни одного тира. Нажмите «Добавить тир», чтобы создать первый.';
    board.append(empty);
  }

  let nameToFocus = null;

  state.tiers.forEach(tier => {
    const row = document.createElement('div');
    row.className = 'tier';
    row.dataset.zone = tier.id;

    // левая цветная плашка: название, счётчик, выбор цвета
    const label = document.createElement('div');
    label.className = 'tier-label';
    paintLabel(label, tier.color);

    const name = document.createElement('div');
    name.className = 'tier-name';
    name.title = 'Нажмите, чтобы переименовать';
    makeEditable(name, {
      value: tier.name,
      fallback: '?',
      onInput: () => fitName(name),
      onSave: text => { tier.name = text; fitName(name); save(); },
    });
    fitName(name);

    const count = document.createElement('div');
    count.className = 'tier-count';
    count.textContent = tier.items.length;

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'tier-color';
    color.title = 'Нажмите, чтобы выбрать цвет';
    color.value = tier.color;
    color.addEventListener('input', () => { tier.color = color.value; paintLabel(label, tier.color); });
    color.addEventListener('change', save);

    label.append(name, count, color);

    // середина: зона с картинками
    const items = document.createElement('div');
    items.className = 'items';
    fillZone(items, tier.items, false);

    // справа: кнопка удаления ряда
    const actions = document.createElement('div');
    actions.className = 'tier-actions';
    const del = document.createElement('button');
    del.className = 'tier-del';
    del.innerHTML = TRASH_ICON;
    del.title = 'Удалить ряд — картинки вернутся в запас';
    del.setAttribute('aria-label', 'Удалить ряд');
    del.addEventListener('click', () => {
      state.pool.push(...tier.items);                    // картинки этого ряда уходят в запас
      state.tiers = state.tiers.filter(t => t !== tier); // сам ряд убираем
      save(); render();
    });
    actions.append(del);

    row.append(label, items, actions);
    attachDropHandlers(row);
    board.append(row);

    if (tier.id === focusTierId) nameToFocus = name;
  });

  // новый тир: ставим курсор в название и выделяем текст, чтобы можно было сразу печатать
  focusTierId = null;
  if (nameToFocus) {
    nameToFocus.focus();
    const range = document.createRange();
    range.selectNodeContents(nameToFocus);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  fillZone(document.getElementById('pool'), state.pool, true);
  document.getElementById('poolCount').textContent = state.pool.length;
}

function fillZone(itemsEl, ids, inPool) {
  itemsEl.innerHTML = '';
  ids.forEach(id => itemsEl.append(makeItem(id, inPool)));

  if (inPool && ids.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'pool-empty';
    hint.textContent = Object.keys(state.images).length
      ? 'Все картинки распределены'
      : 'Нажмите «Добавить», чтобы загрузить картинки';
    itemsEl.append(hint);
  }
}

function makeItem(id, inPool) {
  const el = document.createElement('div');
  el.className = 'item';
  el.draggable = true;          // тащим обёртку, а не <img>
  el.dataset.id = id;

  const img = document.createElement('img');
  img.src = state.images[id];
  img.draggable = false;        // отключаем встроенный drag браузера у картинки
  el.append(img);

  if (inPool) {
    // удалить картинку совсем можно только из запаса
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Удалить картинку';
    del.addEventListener('click', () => {
      removeFromLists(id);
      delete state.images[id];
      save(); render();
    });
    el.append(del);
  } else {
    // из тира картинку можно вернуть в запас двойным кликом
    el.title = 'Двойной клик — вернуть в запас';
    el.addEventListener('dblclick', () => {
      removeFromLists(id);
      state.pool.push(id);
      save(); render();
    });
  }

  el.addEventListener('dragstart', e => {
    dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); // Firefox не начнёт drag без setData
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    dragId = null;
    el.classList.remove('dragging');
  });

  return el;
}

// ---------- 5. DRAG-AND-DROP ----------
// Индекс вставки: ищем ближайшую к курсору картинку и вставляем до неё или после.
function getInsertIndex(itemsEl, e) {
  const children = [...itemsEl.children].filter(c => c.classList.contains('item') && c.dataset.id !== dragId);
  let best = -1, bestDist = Infinity;

  children.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = i; }
  });

  if (best === -1) return 0; // зона пустая
  const r = children[best].getBoundingClientRect();
  return e.clientX < r.left + r.width / 2 ? best : best + 1;
}

// zoneEl — вся строка тира (или блок запаса): подсвечивается и принимает drop целиком.
// Сами картинки лежат в дочернем элементе .items — по нему считаем место вставки.
function attachDropHandlers(zoneEl) {
  zoneEl.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();               // без этого drop не сработает
    zoneEl.classList.add('over');
  });

  zoneEl.addEventListener('dragleave', e => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('over');
  });

  zoneEl.addEventListener('drop', e => {
    e.preventDefault();
    zoneEl.classList.remove('over');
    if (!dragId) return;

    const index = getInsertIndex(zoneEl.querySelector('.items'), e);
    removeFromLists(dragId);                               // убрали из старого места
    getList(zoneEl.dataset.zone).splice(index, 0, dragId); // вставили в новое
    dragId = null;

    save(); render();
  });
}

// ---------- 6. ЗАГРУЗКА КАРТИНОК ----------
// Уменьшаем до 200px, иначе localStorage (лимит ~5 МБ) забьётся за пару фото.
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку')); };
    img.src = url;
  });
}

const fileInput = document.getElementById('file');
fileInput.addEventListener('change', async () => {
  for (const file of fileInput.files) {
    try {
      const dataUrl = await resizeImage(file, 200);
      const id = uid();
      state.images[id] = dataUrl;
      state.pool.push(id);
    } catch (err) {
      console.error(err);
    }
  }
  fileInput.value = ''; // чтобы можно было загрузить тот же файл повторно
  save(); render();
});

// ---------- 7. КНОПКИ ----------
document.getElementById('addTier').addEventListener('click', () => {
  const tier = {
    id: uid(),
    name: 'Новый',
    color: DEFAULT_COLORS[state.tiers.length % DEFAULT_COLORS.length],
    items: [],
  };
  state.tiers.push(tier);
  focusTierId = tier.id;
  save(); render();
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Удалить все тиры и картинки?')) return;
  state = { ...defaultState(), title: state.title }; // тиры и картинки стираем, заголовок оставляем
  save(); render();
});

// ---------- СТАРТ ----------
// Заголовок страницы: тот же приём редактирования, что и у названий тиров.
// Он есть в create.html сразу, поэтому render() его не пересоздаёт — подключаем один раз.
makeEditable(document.getElementById('title'), {
  value: state.title,
  fallback: DEFAULT_TITLE,
  onSave: text => { state.title = text; save(); },
});

attachDropHandlers(document.getElementById('poolZone'));
render();
