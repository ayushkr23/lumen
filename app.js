const STORAGE_KEY = "lumen.tasks.v1";
const RADIUS = 28;
const CIRC = 2 * Math.PI * RADIUS;
const GAP = 10;

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const reduceMotion = () => motionQuery.matches;

const list = document.querySelector("#list");
const empty = document.querySelector("#empty");
const emptyCopy = document.querySelector("#empty-copy");
const composer = document.querySelector("#composer");
const input = document.querySelector("#task-input");
const filters = document.querySelector("#filters");
const glider = document.querySelector("#glider");
const meter = document.querySelector("#meter");
const meterWrap = document.querySelector("#meter-wrap");
const openCount = document.querySelector("#open-count");
const lede = document.querySelector("#lede");
const clearBtn = document.querySelector("#clear");
const status = document.querySelector("#status");

let tasks = loadTasks();
let filter = "open";
let drag = null;
let prevOpen = null;
let gliderReady = false;

meter.style.strokeDasharray = String(CIRC);

document.querySelector("#today").textContent = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "short",
  day: "numeric",
}).format(new Date());

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    return;
  }
  input.classList.remove("is-invalid");
  input.removeAttribute("aria-invalid");
  const task = { id: uid(), text, done: false };
  tasks.unshift(task);
  save();
  input.value = "";
  if (filter === "done") filter = "open";
  announce(`Added ${text}`);
  updateChrome();
  paint({ enterId: task.id });
  input.focus();
});

input.addEventListener("input", () => {
  input.classList.remove("is-invalid");
  input.removeAttribute("aria-invalid");
});

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button || button.dataset.filter === filter) return;
  cancelDrag();
  filter = button.dataset.filter;
  updateChrome();
  paint({ fade: true });
});

clearBtn.addEventListener("click", () => {
  const removed = tasks.filter((task) => task.done).length;
  if (!removed) return;
  const leaving = [...list.querySelectorAll(".slot")].filter((slot) => {
    const task = tasks.find((item) => item.id === slot.dataset.id);
    return task?.done;
  });
  tasks = tasks.filter((task) => !task.done);
  save();
  announce(removed === 1 ? "Cleared 1 completed task" : `Cleared ${removed} completed tasks`);
  updateChrome();
  if (!leaving.length || reduceMotion()) {
    paint();
    return;
  }
  let pending = leaving.length;
  leaving.forEach((slot) => {
    afterLeave(slot, () => {
      pending -= 1;
      if (pending === 0) paint();
    });
  });
});

list.addEventListener("click", (event) => {
  const slot = event.target.closest(".slot");
  if (!slot) return;
  const task = tasks.find((item) => item.id === slot.dataset.id);
  if (!task) return;
  if (event.target.closest(".check")) toggleTask(task, slot);
  if (event.target.closest(".delete")) removeTask(task, slot);
  if (event.target.closest(".text")) beginEdit(task, event.target.closest(".text"));
});

list.addEventListener("keydown", (event) => {
  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  const slot = event.target.closest(".slot");
  if (!slot) return;
  event.preventDefault();
  moveBy(slot.dataset.id, event.key === "ArrowUp" ? -1 : 1);
});

document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".handle");
  if (!handle || event.button !== 0) return;
  startDrag(event, handle);
});

document.addEventListener("pointermove", onDragMove);
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", cancelDrag);

window.addEventListener("resize", placeGlider);
if (document.fonts?.ready) document.fonts.ready.then(placeGlider);

updateChrome();
paint();
input.focus();

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();
    return parsed
      .filter((task) => task && typeof task.id === "string" && typeof task.text === "string")
      .map((task) => ({
        id: task.id,
        text: task.text.slice(0, 240),
        done: Boolean(task.done),
      }));
  } catch {
    return seed();
  }
}

function seed() {
  return [
    { id: uid(), text: "Sketch the first frame", done: false },
    { id: uid(), text: "Name the thing you're avoiding", done: false },
    { id: uid(), text: "Clear one small loop", done: true },
  ];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    announce("Couldn't save in this browser");
  }
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function visibleTasks() {
  return tasks.filter(matches);
}

function matches(task) {
  if (filter === "open") return !task.done;
  if (filter === "done") return task.done;
  return true;
}

function updateChrome() {
  const open = tasks.filter((task) => !task.done).length;
  const done = tasks.length - open;
  const counts = { open, done, all: tasks.length };
  filters.querySelectorAll("[data-filter]").forEach((button) => {
    button.querySelector(".count").textContent = String(counts[button.dataset.filter]);
    button.setAttribute("aria-selected", String(button.dataset.filter === filter));
  });
  const ratio = tasks.length ? done / tasks.length : 0;
  meter.style.strokeDashoffset = String(CIRC * (1 - ratio));
  meter.style.opacity = ratio === 0 ? "0" : "1";
  openCount.textContent = String(open);
  if (tasks.length === 0) lede.textContent = "Nothing here yet.";
  else if (open === 0) lede.textContent = "All caught up.";
  else if (open === 1) lede.textContent = "One thing still open.";
  else lede.textContent = `${open} things still open.`;
  clearBtn.disabled = done === 0;
  meterWrap.setAttribute(
    "aria-label",
    tasks.length ? `${done} of ${tasks.length} done` : "No tasks yet",
  );
  if (prevOpen !== null && open === 0 && tasks.length && prevOpen > 0 && !reduceMotion()) {
    meterWrap.classList.remove("is-full");
    void meterWrap.offsetWidth;
    meterWrap.classList.add("is-full");
  }
  prevOpen = open;
  placeGlider();
}

function placeGlider() {
  const selected = filters.querySelector('[aria-selected="true"]');
  if (!selected) return;
  if (!gliderReady) {
    glider.style.transition = "none";
    glider.style.left = `${selected.offsetLeft}px`;
    glider.style.width = `${selected.offsetWidth}px`;
    void glider.offsetWidth;
    glider.style.transition = "";
    gliderReady = true;
    return;
  }
  glider.style.left = `${selected.offsetLeft}px`;
  glider.style.width = `${selected.offsetWidth}px`;
}

function paint(options = {}) {
  const items = visibleTasks();
  list.replaceChildren();
  if (!items.length) {
    empty.hidden = false;
    emptyCopy.textContent =
      filter === "done"
        ? "No finished tasks yet."
        : filter === "all"
          ? "Add the first thing."
          : "Nothing open. The list can rest.";
    return;
  }
  empty.hidden = true;
  const fragment = document.createDocumentFragment();
  items.forEach((task) => {
    const slot = renderSlot(task);
    if (options.enterId === task.id && !reduceMotion()) slot.classList.add("is-entering");
    fragment.append(slot);
  });
  list.append(fragment);
  if (options.fade && !reduceMotion()) {
    list.classList.remove("is-fading");
    void list.offsetWidth;
    list.classList.add("is-fading");
  }
  const entering = options.enterId ? list.querySelector(`[data-id="${CSS.escape(options.enterId)}"]`) : null;
  if (entering) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => entering.classList.remove("is-entering"));
    });
  }
  if (options.focusId) {
    list.querySelector(`[data-id="${CSS.escape(options.focusId)}"] .text`)?.focus();
  }
}

function renderSlot(task) {
  const slot = document.createElement("li");
  slot.className = "slot";
  slot.dataset.id = task.id;
  slot.innerHTML = `
    <div class="clip">
      <article class="card${task.done ? " is-done" : ""}">
        <button type="button" class="handle" aria-label="Reorder ${escapeAttr(task.text)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">
          <svg viewBox="0 0 12 18" aria-hidden="true">
            <circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/>
            <circle cx="3" cy="9" r="1.3"/><circle cx="9" cy="9" r="1.3"/>
            <circle cx="3" cy="15" r="1.3"/><circle cx="9" cy="15" r="1.3"/>
          </svg>
        </button>
        <button type="button" class="check" aria-pressed="${task.done}" aria-label="${task.done ? "Mark open" : "Mark done"}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle class="ring" cx="12" cy="12" r="9"></circle>
            <path class="tick" d="M7 12.5l3.2 3.2L17 8.5"></path>
          </svg>
        </button>
        <button type="button" class="text">${escapeHtml(task.text)}</button>
        <button type="button" class="delete" aria-label="Delete ${escapeAttr(task.text)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"></path></svg>
        </button>
      </article>
    </div>
  `;
  return slot;
}

function toggleTask(task, slot) {
  task.done = !task.done;
  save();
  const card = slot.querySelector(".card");
  const check = slot.querySelector(".check");
  card.classList.toggle("is-done", task.done);
  check.setAttribute("aria-pressed", String(task.done));
  check.setAttribute("aria-label", task.done ? "Mark open" : "Mark done");
  announce(task.done ? `Completed ${task.text}` : `Reopened ${task.text}`);
  updateChrome();
  if (task.done) burst(check);
  const hides = (filter === "open" && task.done) || (filter === "done" && !task.done);
  if (!hides) return;
  const leave = () => afterLeave(slot, () => paint());
  if (reduceMotion()) leave();
  else setTimeout(leave, 90);
}

function removeTask(task, slot) {
  tasks = tasks.filter((item) => item.id !== task.id);
  save();
  announce(`Removed ${task.text}`);
  updateChrome();
  afterLeave(slot, () => paint());
}

function beginEdit(task, button) {
  const field = document.createElement("input");
  field.className = "edit";
  field.value = task.text;
  field.maxLength = 240;
  field.setAttribute("aria-label", "Edit task");
  button.replaceWith(field);
  field.focus();
  field.select();
  let closed = false;
  const commit = (cancel) => {
    if (closed) return;
    closed = true;
    if (cancel) {
      paint({ focusId: task.id });
      return;
    }
    const text = field.value.trim();
    if (!text) {
      const slot = field.closest(".slot");
      removeTask(task, slot);
      input.focus();
      return;
    }
    task.text = text;
    save();
    announce(`Updated ${text}`);
    paint({ focusId: task.id });
  };
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      commit(true);
    }
  });
  field.addEventListener("blur", () => commit(false));
}

function moveBy(id, delta) {
  const visible = visibleTasks();
  const index = visible.findIndex((task) => task.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= visible.length) return;
  const visuals = captureVisuals();
  reorderVisible(id, visible[next].id);
  save();
  paint({ focusId: id });
  flipFrom(visuals);
}

function startDrag(event, handle) {
  const slot = handle.closest(".slot");
  if (!slot || drag) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  const visible = visibleTasks();
  drag = {
    id: slot.dataset.id,
    pointerId: event.pointerId,
    startY: event.clientY,
    slot,
    previewIndex: visible.findIndex((task) => task.id === slot.dataset.id),
  };
  slot.classList.add("is-lifted");
  document.body.classList.add("is-dragging");
}

function onDragMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dy = event.clientY - drag.startY;
  drag.slot.style.transform = `translateY(${dy}px)`;
  const visible = visibleTasks();
  const from = visible.findIndex((task) => task.id === drag.id);
  const mid = drag.slot.offsetTop + dy + drag.slot.offsetHeight / 2;
  let target = 0;
  list.querySelectorAll(".slot").forEach((slot) => {
    if (slot === drag.slot) return;
    const center = slot.offsetTop + slot.offsetHeight / 2;
    if (mid > center) target += 1;
  });
  if (target === drag.previewIndex) return;
  drag.previewIndex = target;
  const stride = drag.slot.offsetHeight + GAP;
  const slots = [...list.querySelectorAll(".slot")];
  slots.forEach((slot, index) => {
    if (index === from) return;
    let shift = 0;
    if (from < target && index > from && index <= target) shift = -1;
    if (from > target && index >= target && index < from) shift = 1;
    slot.style.transform = shift ? `translateY(${shift * stride}px)` : "";
  });
}

function endDrag(event) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  const visible = visibleTasks();
  const from = visible.findIndex((task) => task.id === drag.id);
  const target = drag.previewIndex;
  const id = drag.id;
  const visuals = captureVisuals();
  drag.slot.classList.remove("is-lifted");
  drag = null;
  document.body.classList.remove("is-dragging");
  if (target !== from && target >= 0 && target < visible.length) {
    reorderVisible(id, visible[target].id);
    save();
  }
  paint();
  flipFrom(visuals);
}

function cancelDrag() {
  if (!drag) return;
  drag.slot.classList.remove("is-lifted");
  drag.slot.style.transform = "";
  list.querySelectorAll(".slot").forEach((slot) => {
    slot.style.transform = "";
  });
  drag = null;
  document.body.classList.remove("is-dragging");
}

function reorderVisible(fromId, toId) {
  const visible = visibleTasks();
  const from = visible.findIndex((task) => task.id === fromId);
  const to = visible.findIndex((task) => task.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = visible.splice(from, 1);
  visible.splice(to, 0, moved);
  let index = 0;
  tasks = tasks.map((task) => (matches(task) ? visible[index++] : task));
}

function captureVisuals() {
  const visuals = new Map();
  list.querySelectorAll(".slot").forEach((slot) => {
    visuals.set(slot.dataset.id, slot.getBoundingClientRect());
  });
  return visuals;
}

function flipFrom(visuals) {
  if (reduceMotion()) return;
  list.querySelectorAll(".slot").forEach((slot) => {
    const prev = visuals.get(slot.dataset.id);
    if (!prev) return;
    const next = slot.getBoundingClientRect();
    const dy = prev.top - next.top;
    if (Math.abs(dy) < 1) return;
    slot.getAnimations().forEach((animation) => animation.cancel());
    slot.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
  });
}

function afterLeave(slot, done) {
  if (!slot || reduceMotion()) {
    done();
    return;
  }
  slot.classList.add("is-leaving");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  slot.addEventListener("transitionend", (event) => {
    if (event.target === slot && event.propertyName === "grid-template-rows") finish();
  });
  setTimeout(finish, 240);
}

function burst(origin) {
  if (reduceMotion()) return;
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 6; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    if (i % 2) spark.style.background = "#f6efe8";
    document.body.append(spark);
    const angle = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const dist = 20 + (i % 3) * 7;
    const animation = spark.animate(
      [
        { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 1 },
        {
          transform: `translate(${cx + Math.cos(angle) * dist}px, ${cy + Math.sin(angle) * dist}px) scale(0.25)`,
          opacity: 0,
        },
      ],
      { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    animation.onfinish = () => spark.remove();
  }
}

function announce(message) {
  status.textContent = "";
  status.textContent = message;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
