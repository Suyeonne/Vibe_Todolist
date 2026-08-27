(() => {
  "use strict";

  const STORAGE_KEY = "vibe-todos";

  const firebaseConfig = {
    apiKey: "AIzaSyD2xYK8OMRzZyHucE-G_DOsbgIEKNFiEN4",
    authDomain: "susu-todo-backend.firebaseapp.com",
    projectId: "susu-todo-backend",
    storageBucket: "susu-todo-backend.firebasestorage.app",
    messagingSenderId: "676692013172",
    appId: "1:676692013172:web:c40626b8944bb81695a121",
    // 이 프로젝트의 Realtime Database는 asia-southeast1 리전에 있다.
    databaseURL:
      "https://susu-todo-backend-default-rtdb.asia-southeast1.firebasedatabase.app/",
  };

  const SDK = "https://www.gstatic.com/firebasejs/12.18.0";
  const DB_PATH = "todos";

  const el = {
    form: document.getElementById("todoForm"),
    input: document.getElementById("todoInput"),
    starToggle: document.getElementById("starToggle"),
    list: document.getElementById("todoList"),
    filters: document.getElementById("filters"),
    empty: document.getElementById("emptyState"),
    summary: document.getElementById("summary"),
    clearDone: document.getElementById("clearDone"),
    today: document.getElementById("today"),
    progressLabel: document.getElementById("progressLabel"),
  };

  const ICONS = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 16.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86L12 3.5z" />',
    edit: '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20z" /><path d="M13.5 6.5l4 4" />',
    trash:
      '<path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 12h10l1-12" /><path d="M10 11v5M14 11v5" />',
  };

  let todos = load();
  let filter = "all";
  let nextIsImportant = false;
  let editingId = null;

  /* ---------- 데이터 ---------- */

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({
          id: String(t.id ?? crypto.randomUUID()),
          text: t.text,
          done: Boolean(t.done),
          important: Boolean(t.important),
          createdAt: Number(t.createdAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }

  function find(id) {
    return todos.find((t) => t.id === id);
  }

  /* ---------- Firebase(Realtime Database) ---------- */

  // 연결되면 채워지는 핸들. 연결 전이거나 실패하면 null 이고,
  // 그때는 이 기기의 localStorage 만으로 동작한다.
  let cloud = null;
  let cloudReady = false;

  async function initCloud() {
    try {
      const [{ initializeApp }, rtdb] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-database.js`),
      ]);

      const db = rtdb.getDatabase(initializeApp(firebaseConfig));
      const rootRef = rtdb.ref(db, DB_PATH);
      const itemRef = (id) => rtdb.ref(db, `${DB_PATH}/${id}`);

      cloud = {
        set: (todo) => rtdb.set(itemRef(todo.id), toRecord(todo)),
        patch: (id, patch) => rtdb.update(itemRef(id), patch),
        remove: (id) => rtdb.remove(itemRef(id)),
      };

      rtdb.onValue(rootRef, onCloudChange, onCloudFail);
    } catch (err) {
      onCloudFail(err);
    }
  }

  function onCloudChange(snapshot) {
    const remote = Object.entries(snapshot.val() ?? {}).map(([id, data]) =>
      fromRecord(id, data)
    );

    // 첫 연결에서 서버가 비어 있으면 이 기기의 할일을 올려준다.
    if (!cloudReady && remote.length === 0 && todos.length > 0) {
      cloudReady = true;
      todos.forEach((todo) => write((c) => c.set(todo)));
      return;
    }

    cloudReady = true;
    todos = remote;
    save();
    if (!editingId) render();
  }

  function onCloudFail(err) {
    cloud = null;
    console.warn(
      "[todolist] Realtime Database에 연결하지 못했습니다. 이 기기에만 저장됩니다.",
      err
    );
  }

  // 클라우드가 없으면 조용히 넘어가고, 실패해도 화면은 그대로 유지한다.
  function write(task) {
    if (!cloud) return;
    task(cloud).catch((err) => {
      console.warn("[todolist] 클라우드 저장에 실패했습니다.", err);
    });
  }

  function toRecord(todo) {
    return {
      text: todo.text,
      done: todo.done,
      important: todo.important,
      createdAt: todo.createdAt,
    };
  }

  function fromRecord(id, data) {
    return {
      id,
      text: String(data?.text ?? ""),
      done: Boolean(data?.done),
      important: Boolean(data?.important),
      createdAt: Number(data?.createdAt) || Date.now(),
    };
  }

  /* ---------- 액션 ---------- */

  function addTodo(text, important) {
    const todo = {
      id: crypto.randomUUID(),
      text,
      done: false,
      important,
      createdAt: Date.now(),
    };
    todos.push(todo);
    save();
    render();
    write((c) => c.set(todo));
  }

  function updateTodo(id, patch) {
    const todo = find(id);
    if (!todo) return;
    Object.assign(todo, patch);
    save();
    render();
    write((c) => c.patch(id, patch));
  }

  function removeTodo(id) {
    todos = todos.filter((t) => t.id !== id);
    save();
    render();
    write((c) => c.remove(id));
  }

  /* ---------- 렌더 ---------- */

  // 중요한 항목은 위로, 완료한 항목은 아래로 모은다.
  function sorted(items) {
    return [...items].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  function matchesFilter(todo) {
    if (filter === "important") return todo.important;
    if (filter === "active") return !todo.done;
    if (filter === "done") return todo.done;
    return true;
  }

  function createItem(todo) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = todo.id;
    if (todo.done) li.classList.add("is-done");
    if (todo.important) li.classList.add("is-important");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "item__check";
    check.checked = todo.done;
    check.title = "완료 표시";
    check.addEventListener("change", () =>
      updateTodo(todo.id, { done: check.checked })
    );

    const text = document.createElement("span");
    text.className = "item__text";
    text.textContent = todo.text;
    text.title = "더블클릭하면 수정할 수 있어요";
    text.addEventListener("dblclick", () => startEdit(li, todo));

    const actions = document.createElement("div");
    actions.className = "item__actions";
    actions.append(
      iconButton("star", todo.important ? "중요 해제" : "중요 표시", () =>
        updateTodo(todo.id, { important: !todo.important })
      ),
      iconButton("edit", "수정", () => startEdit(li, todo)),
      iconButton("trash", "삭제", () => removeTodo(todo.id))
    );
    if (todo.important) {
      actions.firstChild.classList.add("is-on");
    }

    li.append(check, text, actions);
    return li;
  }

  function iconButton(icon, label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    if (icon === "star") btn.classList.add("icon-btn--star");
    if (icon === "trash") btn.classList.add("icon-btn--danger");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function startEdit(li, todo) {
    if (li.querySelector(".item__edit")) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "item__edit";
    input.value = todo.text;
    input.maxLength = 120;

    li.replaceChild(input, li.querySelector(".item__text"));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    // 편집 중에는 서버 변경이 들어와도 다시 그리지 않는다.
    editingId = todo.id;

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      editingId = null;
      const value = input.value.trim();
      if (value && value !== todo.text) updateTodo(todo.id, { text: value });
      else render();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        settled = true;
        editingId = null;
        render();
      }
    });
    input.addEventListener("blur", commit);
  }

  function render() {
    const visible = sorted(todos.filter(matchesFilter));

    el.list.replaceChildren(...visible.map(createItem));

    const counts = {
      all: todos.length,
      important: todos.filter((t) => t.important).length,
      active: todos.filter((t) => !t.done).length,
      done: todos.filter((t) => t.done).length,
    };
    for (const [key, value] of Object.entries(counts)) {
      const node = el.filters.querySelector(`[data-count="${key}"]`);
      if (node) node.textContent = value;
    }

    el.empty.hidden = visible.length > 0;
    if (visible.length === 0) {
      el.empty.querySelector(".empty__text").textContent =
        todos.length === 0
          ? "아직 할일이 없어요"
          : "이 조건에 맞는 할일이 없어요";
    }

    el.summary.textContent = todos.length
      ? `남은 할일 ${counts.active}개 · 전체 ${counts.all}개`
      : "";
    el.clearDone.disabled = counts.done === 0;

    const ratio = counts.all ? counts.done / counts.all : 0;
    el.progressLabel.textContent = `${Math.round(ratio * 100)}%`;
  }

  /* ---------- 이벤트 ---------- */

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text) return;
    addTodo(text, nextIsImportant);
    el.input.value = "";
    nextIsImportant = false;
    el.starToggle.setAttribute("aria-pressed", "false");
    el.input.focus();
  });

  el.starToggle.addEventListener("click", () => {
    nextIsImportant = !nextIsImportant;
    el.starToggle.setAttribute("aria-pressed", String(nextIsImportant));
  });

  el.filters.addEventListener("click", (e) => {
    const btn = e.target.closest(".filters__btn");
    if (!btn) return;
    filter = btn.dataset.filter;
    el.filters
      .querySelectorAll(".filters__btn")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    render();
  });

  el.clearDone.addEventListener("click", () => {
    const removed = todos.filter((t) => t.done).map((t) => t.id);
    todos = todos.filter((t) => !t.done);
    save();
    render();
    removed.forEach((id) => write((c) => c.remove(id)));
  });

  const now = new Date();
  el.today.textContent = `${now.getFullYear()}   ${now.toLocaleDateString("en-US", {
    month: "long",
  })} ${now.getDate()}`;

  render();
  el.input.focus();
  initCloud();
})();
