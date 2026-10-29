// Canciones: lista de canciones. Se ven en orden alfabético (A-Z) o en el orden que tú dejas arrastrando el asa.
// Los datos se guardan en este dispositivo.
// Altura de la app. Instalada en la pantalla de inicio (navigator.standalone): toda la pantalla.
// En Safari: la altura visible, que cambia cuando Safari muestra u oculta su barra.
function ajustarAltura() {
  const alto = navigator.standalone ? screen.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", `${alto}px`);
}
ajustarAltura();
window.addEventListener("load", ajustarAltura);
window.addEventListener("pageshow", ajustarAltura);
window.addEventListener("resize", ajustarAltura);
window.addEventListener("orientationchange", ajustarAltura);
document.addEventListener("visibilitychange", ajustarAltura);
if (window.visualViewport) window.visualViewport.addEventListener("resize", ajustarAltura);
setTimeout(ajustarAltura, 500);

const STORAGE_KEY = "canciones-v1";
const BACKUP_KEY = "canciones-v1-copia";
const MODE_KEY = "canciones-v1-modo";
const DELETE_WIDTH = 84;
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const list = document.getElementById("list");
const count = document.getElementById("count");
const toastEl = document.getElementById("toast");
const ficha = document.getElementById("ficha");
const fichaForm = document.getElementById("fichaForm");
const fichaTitle = document.getElementById("fichaTitle");
const fDelete = document.getElementById("fDelete");
const fCancel = document.getElementById("fCancel");
const ordenBtn = document.getElementById("ordenBtn");

let songs = load();
let modo = localStorage.getItem(MODE_KEY) === "manual" ? "manual" : "alfabetico";
let editingId = null;
let swipedId = null;
let toastTimer = null;
let drag = null;

// Datos

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Formato no válido");
    return data;
  } catch (err) {
    // No perder nada en silencio: se guarda una copia antes de empezar de cero.
    localStorage.setItem(BACKUP_KEY, raw);
    alert("No se han podido leer los datos guardados. Se ha creado una copia de seguridad.");
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Orden alfabético por banda (sin distinguir tildes ni mayúsculas); empates por canción.
function comparar(a, b) {
  return collator.compare(a.banda, b.banda) || collator.compare(a.cancion, b.cancion);
}

// "alfabetico" muestra A-Z; "manual" muestra el orden que has dejado arrastrando.
function lista() {
  return modo === "alfabetico" ? songs.slice().sort(comparar) : songs;
}

function setModo(nuevo) {
  modo = nuevo;
  localStorage.setItem(MODE_KEY, nuevo);
}

// Pantalla

function render() {
  swipedId = null;
  list.textContent = "";
  const visibles = lista();
  count.textContent = visibles.length === 1 ? "1 canción" : `${visibles.length} canciones`;
  ordenBtn.classList.toggle("activo", modo === "alfabetico");
  if (!visibles.length) {
    const vacio = document.createElement("li");
    vacio.className = "empty";
    vacio.textContent = "Todavía no hay canciones. Toca + para añadir la primera.";
    list.appendChild(vacio);
    return;
  }
  for (const r of visibles) list.appendChild(buildRow(r));
}

function copiable(campo, valor) {
  const span = document.createElement("span");
  span.className = `copy ${campo}`;
  span.dataset.copy = campo;
  span.setAttribute("role", "button");
  span.textContent = valor;
  return span;
}

function buildRow(r) {
  const row = document.createElement("li");
  row.className = "row";
  row.dataset.id = r.id;

  // Detrás de la fila: botón rojo que aparece al deslizar a la izquierda.
  const del = document.createElement("button");
  del.className = "delete-bg";
  del.textContent = "Borrar";
  del.addEventListener("click", () => {
    if (confirm(`¿Borrar "${r.cancion}" de ${r.banda}?`)) {
      songs = songs.filter((x) => x.id !== r.id);
      save();
      render();
    } else {
      setSwiped(null);
    }
  });

  const content = document.createElement("div");
  content.className = "row-content";

  // Línea 1: banda a la izquierda y nota pequeña a la derecha. Línea 2: canción.
  const texto = document.createElement("div");
  texto.className = "row-text";
  const linea1 = document.createElement("div");
  linea1.className = "linea1";
  const notas = document.createElement("span");
  notas.className = "notas";
  notas.textContent = r.notas;
  linea1.append(copiable("banda", r.banda), notas);
  texto.append(linea1, copiable("cancion", r.cancion));

  content.append(texto, buildHandle(row));
  row.append(del, content);

  // Deslizar a la izquierda para borrar
  let startX = 0;
  let offset = 0;
  let dragging = false;
  let moved = false;

  content.addEventListener("pointerdown", (e) => {
    if (swipedId && swipedId !== r.id) setSwiped(null);
    startX = e.clientX;
    offset = 0;
    dragging = true;
    moved = false;
  });

  content.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 8) return;
    if (!moved) content.setPointerCapture(e.pointerId);
    moved = true;
    const base = swipedId === r.id ? -DELETE_WIDTH : 0;
    offset = Math.min(0, Math.max(-DELETE_WIDTH, base + dx));
    content.classList.add("dragging");
    content.style.transform = `translateX(${offset}px)`;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    content.classList.remove("dragging");
    content.style.transform = "";
    if (!moved) return;
    setSwiped(offset < -DELETE_WIDTH / 2 ? r.id : null);
  };
  content.addEventListener("pointerup", endDrag);
  content.addEventListener("pointercancel", endDrag);

  // Toque: copia la banda o la canción; en cualquier otro punto abre la ficha para editar.
  content.addEventListener("click", (e) => {
    if (moved) return;
    if (e.target.closest(".handle")) return;
    // Con una fila deslizada, tocar la cierra en lugar de hacer otra cosa.
    if (swipedId) {
      setSwiped(null);
      return;
    }
    const copia = e.target.closest("[data-copy]");
    if (copia) {
      copiar(r[copia.dataset.copy]);
      return;
    }
    openFicha(r);
  });

  return row;
}

function setSwiped(id) {
  const abierta = list.querySelector(".row.swiped");
  if (abierta) abierta.classList.remove("swiped");
  swipedId = id;
  if (id) {
    const fila = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (fila) fila.classList.add("swiped");
  }
}

// Arrastrar para reordenar a mano

function buildHandle(fila) {
  const asa = document.createElement("span");
  asa.className = "handle";
  asa.setAttribute("role", "button");
  asa.setAttribute("aria-label", "Mover canción");
  asa.addEventListener("pointerdown", (e) => empezarArrastre(e, fila, asa));
  return asa;
}

function empezarArrastre(e, fila, asa) {
  // Que el deslizamiento de la fila no se entere de este toque.
  e.stopPropagation();
  e.preventDefault();
  if (swipedId) setSwiped(null);
  asa.setPointerCapture(e.pointerId);
  drag = { fila, pointerId: e.pointerId, y: e.clientY, antes: lista().map((x) => x.id), timer: null };
  fila.classList.add("dragging");
}

function moverArrastre(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.y = e.clientY;
  reubicar();
  autoDesplazar();
}

// Coloca la fila arrastrada según la posición del dedo.
function reubicar() {
  const otras = [...list.querySelectorAll(".row:not(.dragging)")];
  const siguiente = otras.find((f) => {
    const r = f.getBoundingClientRect();
    return drag.y < r.top + r.height / 2;
  });
  if (siguiente) list.insertBefore(drag.fila, siguiente);
  else list.appendChild(drag.fila);
}

// Si el dedo está cerca del borde de la lista, la lista se desplaza sola.
function autoDesplazar() {
  clearInterval(drag.timer);
  drag.timer = null;
  const area = list.getBoundingClientRect();
  const zona = 60;
  const paso = drag.y < area.top + zona ? -8 : drag.y > area.bottom - zona ? 8 : 0;
  if (!paso) return;
  drag.timer = setInterval(() => {
    list.scrollTop += paso;
    reubicar();
  }, 16);
}

function soltarArrastre(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  clearInterval(drag.timer);
  drag.fila.classList.remove("dragging");
  const despues = [...list.querySelectorAll(".row")].map((f) => f.dataset.id);
  const cambio = despues.some((id, i) => id !== drag.antes[i]);
  drag = null;
  if (cambio) {
    songs = despues.map((id) => songs.find((x) => x.id === id)).filter(Boolean);
    setModo("manual");
    save();
  }
  render();
}

list.addEventListener("pointermove", moverArrastre);
list.addEventListener("pointerup", soltarArrastre);
list.addEventListener("pointercancel", soltarArrastre);

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch (err) {
    // Respaldo para navegadores sin acceso directo al portapapeles.
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  mostrarAviso(`Copiado: ${texto}`);
}

function mostrarAviso(mensaje) {
  toastEl.textContent = mensaje;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

// Ficha de añadir y editar

function openFicha(r) {
  editingId = r ? r.id : null;
  fichaTitle.textContent = r ? "Editar canción" : "Nueva canción";
  fDelete.hidden = !r;
  fichaForm.banda.value = r ? r.banda : "";
  fichaForm.cancion.value = r ? r.cancion : "";
  fichaForm.notas.value = r ? r.notas : "";
  ficha.showModal();
}

fichaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const datos = {
    banda: fichaForm.banda.value.trim(),
    cancion: fichaForm.cancion.value.trim(),
    notas: fichaForm.notas.value.trim(),
  };
  if (!datos.banda || !datos.cancion) {
    mostrarAviso("Faltan la banda o la canción");
    return;
  }
  const existente = songs.find((x) => x.id === editingId);
  if (existente) {
    Object.assign(existente, datos);
  } else {
    // Una canción nueva entra antes de la primera que vaya después alfabéticamente.
    const nueva = { id: newId(), ...datos };
    const pos = songs.findIndex((x) => comparar(nueva, x) < 0);
    if (pos < 0) songs.push(nueva);
    else songs.splice(pos, 0, nueva);
  }
  save();
  ficha.close();
  render();
});

fCancel.addEventListener("click", () => ficha.close());

fDelete.addEventListener("click", () => {
  const r = songs.find((x) => x.id === editingId);
  if (r && confirm(`¿Borrar "${r.cancion}" de ${r.banda}?`)) {
    songs = songs.filter((x) => x.id !== editingId);
    save();
    ficha.close();
    render();
  }
});

document.getElementById("addBtn").addEventListener("click", () => openFicha());

ordenBtn.addEventListener("click", () => {
  setModo("alfabetico");
  render();
  mostrarAviso("Orden alfabético");
});

// Copia de seguridad

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(songs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `canciones-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const datos = JSON.parse(await file.text());
    if (!Array.isArray(datos)) throw new Error("Formato no válido");
    if (!confirm(`Se sustituirán las canciones actuales por las ${datos.length} del archivo. ¿Continuar?`)) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(songs));
    songs = datos
      .filter((x) => x && typeof x.banda === "string" && typeof x.cancion === "string")
      .map((x) => ({ id: newId(), banda: x.banda, cancion: x.cancion, notas: typeof x.notas === "string" ? x.notas : "" }));
    save();
    render();
    mostrarAviso(`Importadas ${songs.length} canciones`);
  } catch (err) {
    alert(`No se ha podido importar: ${err.message}`);
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

render();
