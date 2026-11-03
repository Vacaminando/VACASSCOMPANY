import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  enableIndexedDbPersistence, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  onSnapshot,
  query,
  orderBy,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// === REEMPLAZA ESTAS LLAVES CON LAS TUYAS DE FIREBASE ===
const firebaseConfig = {
  apiKey: "AIzaSyA4mVbBaJDqPLBKU4QzOx9Il5g9y7Cordw",
  authDomain: "gestion-documental-app.firebaseapp.com",
  projectId: "gestion-documental-app",
  storageBucket: "gestion-documental-app.firebasestorage.app",
  messagingSenderId: "990096807437",
  appId: "1:990096807437:web:b0bde0f7c528c77b64e744"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

enableIndexedDbPersistence(db).catch(err => console.warn("Offline warning:", err.code));

let currentUser = null;
let allRecords = [];
let currentFilterEstado = "TODOS";
let currentFilterUbicacion = "TODOS";
let currentSortOrder = "FECHA_ASC";
let activeQuickEditId = null;
let activeDataEditId = null;
let selectedRecordIds = new Set();

// === SISTEMA DE AUTENTICACIÓN (LOGIN/LOGOUT) ===
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const btnLogin = document.getElementById("btnLoginModal");
  const btnLogout = document.getElementById("btnLogout");
  const adminBadge = document.getElementById("adminBadge");

  if (user) {
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    adminBadge.classList.remove("hidden");
  } else {
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    adminBadge.classList.add("hidden");
  }
  renderTable();
});

// Modal Login Events
const loginModal = document.getElementById("loginModal");
document.getElementById("btnLoginModal").onclick = () => loginModal.classList.remove("hidden");
document.getElementById("btnCloseLogin").onclick = () => loginModal.classList.add("hidden");

document.getElementById("btnDoLogin").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;
  const loginErr = document.getElementById("loginError");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    loginModal.classList.add("hidden");
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    loginErr.classList.add("hidden");
  } catch (err) {
    loginErr.innerText = "Error: Credenciales incorrectas.";
    loginErr.classList.remove("hidden");
  }
};

document.getElementById("btnLogout").onclick = () => {
  if (confirm("¿Cerrar sesión de Administrador?")) {
    signOut(auth);
  }
};

// Cargar registros ordenados por fecha de creación por defecto
const q = query(collection(db, "expedientes"), orderBy("fechaCreacion", "asc"));
onSnapshot(q, (snapshot) => {
  allRecords = [];
  snapshot.forEach((docSnap) => {
    allRecords.push({ id: docSnap.id, ...docSnap.data() });
  });
  renderTable();
});

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const searchVal = document.getElementById("searchInput").value.toLowerCase();
  tbody.innerHTML = "";

  const cleanString = (str) => {
    return (str || "")
      .toString()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const nitCounts = {};
  allRecords.forEach(r => {
    const nitClean = cleanString(r.nit);
    if (nitClean && nitClean !== "sn") {
      nitCounts[nitClean] = (nitCounts[nitClean] || 0) + 1;
    }
  });

  let filtered = allRecords.filter(r => {
    const matchesSearch = (r.nit || "").toLowerCase().includes(searchVal) || (r.nombre || "").toLowerCase().includes(searchVal);
    let matchesEstado = true;
    const nitClean = cleanString(r.nit);
    const isDuplicate = nitCounts[nitClean] > 1;

    if (currentFilterEstado === "REPETIDOS") {
      matchesEstado = isDuplicate;
    } else if (currentFilterEstado !== "TODOS") {
      matchesEstado = r.estado === currentFilterEstado;
    }

    const matchesUbicacion = currentFilterUbicacion === "TODOS" || r.ubicacion === currentFilterUbicacion;
    return matchesSearch && matchesEstado && matchesUbicacion;
  });

  filtered.sort((a, b) => {
    const nameA = cleanString(a.nombre);
    const nameB = cleanString(b.nombre);
    const dateA = a.fechaCreacion || "";
    const dateB = b.fechaCreacion || "";

    if (currentSortOrder === "NOMBRE_ASC") return nameA.localeCompare(nameB);
    if (currentSortOrder === "NOMBRE_DESC") return nameB.localeCompare(nameA);
    if (currentSortOrder === "FECHA_DESC") return dateB.localeCompare(dateA);
    return dateA.localeCompare(dateB);
  });

  filtered.forEach(r => {
    const tr = document.createElement("tr");
    const nitClean = cleanString(r.nit);
    const isDuplicate = nitCounts[nitClean] > 1;
    const bgClass = isDuplicate ? "bg-amber-100 hover:bg-amber-200" : "hover:bg-slate-50";

    tr.className = `${bgClass} transition border-b border-slate-100`;

    const isChecked = selectedRecordIds.has(r.id) ? "checked" : "";
    const badgeState = r.estado === "PENDIENTE" 
      ? `<span class="quick-edit-btn cursor-pointer px-2 py-1 rounded bg-red-100 text-red-700 font-bold text-xs hover:bg-red-200" data-id="${r.id}">PENDIENTE ✏️</span>`
      : `<span class="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-bold text-xs">${r.estado}</span>`;

    const duplicateBadge = isDuplicate ? `<span class="ml-1 text-xs text-amber-800 font-bold" title="Archivo duplicado">⚠️ Repetido</span>` : "";

    // El botón de borrar solo es visible si hay un administrador logueado
    const deleteBtnHTML = currentUser 
      ? `<button class="delete-single-btn text-rose-600 hover:text-rose-900 font-bold text-xs" data-id="${r.id}" title="Borrar">🗑️</button>` 
      : `<span class="text-xs text-slate-300" title="Requiere inicio de sesión de admin">🔒</span>`;

    tr.innerHTML = `
      <td class="px-4 py-3"><input type="checkbox" class="row-checkbox" data-id="${r.id}" ${isChecked}></td>
      <td class="px-4 py-3 font-mono text-xs text-slate-500">${r.customId || r.id.substring(0,6)}</td>
      <td class="px-4 py-3 font-semibold text-slate-800">${r.nit} ${duplicateBadge}</td>
      <td class="px-4 py-3 text-slate-700 font-medium">${r.nombre}</td>
      <td class="px-4 py-3 text-xs font-medium text-slate-600">${r.tipo}</td>
      <td class="px-4 py-3 text-xs font-bold text-indigo-900">${r.ubicacion}</td>
      <td class="px-4 py-3">${badgeState}</td>
      <td class="px-4 py-3 text-xs text-slate-500">${r.observaciones || "-"}</td>
      <td class="px-4 py-3 text-right space-x-2">
        <button class="edit-data-btn text-indigo-600 hover:text-indigo-900 font-bold text-xs" data-id="${r.id}" title="Editar cliente">✏️ Editar</button>
        ${deleteBtnHTML}
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateSelectedUI();

  document.querySelectorAll(".quick-edit-btn").forEach(btn => {
    btn.onclick = (e) => openQuickEdit(e.target.getAttribute("data-id"));
  });

  document.querySelectorAll(".edit-data-btn").forEach(btn => {
    btn.onclick = (e) => openEditDataModal(e.target.getAttribute("data-id"));
  });

  document.querySelectorAll(".delete-single-btn").forEach(btn => {
    btn.onclick = (e) => deleteSingleRecord(e.target.getAttribute("data-id"));
  });

  document.querySelectorAll(".row-checkbox").forEach(chk => {
    chk.onchange = (e) => {
      const id = e.target.getAttribute("data-id");
      if (e.target.checked) selectedRecordIds.add(id);
      else selectedRecordIds.delete(id);
      updateSelectedUI();
    };
  });
}

// === WIZARD Y MODALES IGUALES ===
let wizardData = { tipo: "", estado: "", ubicacion: "", nit: "", nombre: "", observaciones: "" };

function resetWizardForm() {
  wizardData = { tipo: "", estado: "", ubicacion: "", nit: "", nombre: "", observaciones: "" };
  document.getElementById("wizardNit").value = "";
  document.getElementById("wizardName").value = "";
  document.getElementById("wizardObs").value = "";
  document.getElementById("duplicateAlert").classList.add("hidden");
  showStep(1);
}

const wizardModal = document.getElementById("wizardModal");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const step4 = document.getElementById("step4");

document.getElementById("btnOpenWizard").onclick = () => {
  resetWizardForm();
  wizardModal.classList.remove("hidden");
};

document.getElementById("btnCloseWizard").onclick = () => {
  wizardModal.classList.add("hidden");
  resetWizardForm();
};

function showStep(num) {
  step1.classList.add("hidden");
  step2.classList.add("hidden");
  step3.classList.add("hidden");
  step4.classList.add("hidden");

  if(num === 1) step1.classList.remove("hidden");
  if(num === 2) step2.classList.remove("hidden");
  if(num === 3) step3.classList.remove("hidden");
  if(num === 4) step4.classList.remove("hidden");
  document.getElementById("wizardTitle").innerText = `Nuevo Registro - Paso ${num}`;
}

document.querySelectorAll(".btn-type").forEach(btn => {
  btn.onclick = (e) => {
    wizardData.tipo = e.target.getAttribute("data-type");
    if(wizardData.tipo === "OFERTA COMERCIAL" || wizardData.tipo === "DIPLOMATICO") {
      wizardData.ubicacion = "ESPECIAL";
      wizardData.estado = "N/A";
      showStep(4);
    } else {
      showStep(2);
    }
  };
});

document.getElementById("btnSavedYes").onclick = () => showStep(3);
document.getElementById("btnSavedNo").onclick = () => {
  wizardData.ubicacion = "POR ASIGNAR";
  wizardData.estado = "PENDIENTE";
  showStep(4);
};

document.getElementById("btnStep3Next").onclick = () => {
  wizardData.ubicacion = document.getElementById("wizardLocation").value;
  wizardData.estado = "GUARDADO";
  showStep(4);
};

document.getElementById("wizardNit").oninput = (e) => {
  const val = e.target.value.trim();
  const exists = allRecords.some(r => r.nit === val && val !== "");
  document.getElementById("duplicateAlert").classList.toggle("hidden", !exists);
};

document.getElementById("btnSaveWizard").onclick = async () => {
  const saveBtn = document.getElementById("btnSaveWizard");
  const nit = document.getElementById("wizardNit").value.trim();
  const nombre = document.getElementById("wizardName").value.trim();
  const obs = document.getElementById("wizardObs").value.trim();

  if(!nit || !nombre) return alert("Ingresa NIT y Nombre obligatoriamente");

  saveBtn.disabled = true;
  saveBtn.innerText = "Guardando...";

  try {
    const customId = "DOC-" + Math.floor(1000 + Math.random() * 9000);
    await addDoc(collection(db, "expedientes"), {
      customId: customId,
      nit: nit,
      nombre: nombre,
      tipo: wizardData.tipo,
      ubicacion: wizardData.ubicacion,
      estado: wizardData.estado,
      observaciones: obs,
      fechaCreacion: new Date().toISOString(),
      ultimaModificacion: new Date().toISOString()
    });

    wizardModal.classList.add("hidden");
    resetWizardForm();
  } catch(e) {
    alert("Error al guardar: " + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = "Finalizar y Guardar";
  }
};

// === EDICIÓN RÁPIDA DE PENDIENTES ===
const quickEditModal = document.getElementById("quickEditModal");
document.getElementById("btnCloseQuickEdit").onclick = () => quickEditModal.classList.add("hidden");

function openQuickEdit(id) {
  activeQuickEditId = id;
  const rec = allRecords.find(r => r.id === id);
  if(!rec) return;

  document.getElementById("quickEditClientName").innerText = `${rec.nombre} (NIT: ${rec.nit})`;
  document.getElementById("quickEditObs").value = rec.observaciones || "";
  quickEditModal.classList.remove("hidden");
}

document.getElementById("btnSaveQuickEdit").onclick = async () => {
  if(!activeQuickEditId) return;
  const newLoc = document.getElementById("quickEditLocation").value;
  const newObs = document.getElementById("quickEditObs").value.trim();

  await updateDoc(doc(db, "expedientes", activeQuickEditId), {
    ubicacion: newLoc,
    estado: "GUARDADO",
    observaciones: newObs,
    ultimaModificacion: new Date().toISOString()
  });

  quickEditModal.classList.add("hidden");
};

// === EDICIÓN DE DATOS GENERALES DEL CLIENTE ===
const editDataModal = document.getElementById("editDataModal");
document.getElementById("btnCloseEditData").onclick = () => editDataModal.classList.add("hidden");

function openEditDataModal(id) {
  activeDataEditId = id;
  const rec = allRecords.find(r => r.id === id);
  if(!rec) return;

  document.getElementById("editDataNit").value = rec.nit || "";
  document.getElementById("editDataName").value = rec.nombre || "";
  document.getElementById("editDataType").value = rec.tipo || "NORMAL";
  document.getElementById("editDataObs").value = rec.observaciones || "";
  
  editDataModal.classList.remove("hidden");
}

document.getElementById("btnSaveDataEdit").onclick = async () => {
  if(!activeDataEditId) return;
  const newNit = document.getElementById("editDataNit").value.trim();
  const newName = document.getElementById("editDataName").value.trim();
  const newType = document.getElementById("editDataType").value;
  const newObs = document.getElementById("editDataObs").value.trim();

  if(!newNit || !newName) return alert("El NIT y el Nombre son requeridos");

  await updateDoc(doc(db, "expedientes", activeDataEditId), {
    nit: newNit,
    nombre: newName,
    tipo: newType,
    observaciones: newObs,
    ultimaModificacion: new Date().toISOString()
  });

  editDataModal.classList.add("hidden");
};

// === BORRADO UNITARIO Y MASIVO CON PROTECCIÓN ===
async function deleteSingleRecord(id) {
  if (!currentUser) return alert("Debes iniciar sesión como administrador para eliminar registros.");
  if (confirm("¿Estás seguro de eliminar este registro?")) {
    try {
      await deleteDoc(doc(db, "expedientes", id));
      selectedRecordIds.delete(id);
    } catch(err) {
      alert("Error al eliminar: " + err.message);
    }
  }
}

document.getElementById("selectAll").onchange = (e) => {
  if(e.target.checked) {
    allRecords.forEach(r => selectedRecordIds.add(r.id));
  } else {
    selectedRecordIds.clear();
  }
  renderTable();
};

function updateSelectedUI() {
  const btnDelete = document.getElementById("btnDeleteSelected");
  const countSpan = document.getElementById("selectedCount");
  countSpan.innerText = selectedRecordIds.size;

  // Solo mostrar el botón de borrado masivo si está logueado el admin y hay items seleccionados
  if (currentUser && selectedRecordIds.size > 0) {
    btnDelete.classList.remove("hidden");
  } else {
    btnDelete.classList.add("hidden");
  }
}

document.getElementById("btnDeleteSelected").onclick = async () => {
  if (!currentUser) return alert("Debes iniciar sesión como administrador para eliminar registros.");
  if (!confirm(`¿Deseas borrar permanentemente los ${selectedRecordIds.size} registros seleccionados?`)) return;

  try {
    const batch = writeBatch(db);
    selectedRecordIds.forEach(id => {
      batch.delete(doc(db, "expedientes", id));
    });

    await batch.commit();
    selectedRecordIds.clear();
    document.getElementById("selectAll").checked = false;
  } catch(err) {
    alert("Error en borrado masivo: " + err.message);
  }
};

// === IMPORTACIÓN DE EXCEL/CSV Y OTROS EVENTOS ===
document.getElementById("excelInput").onchange = (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, {type: 'array'});
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, {defval: ""});

      if(json.length === 0) return alert("El archivo está vacío.");

      const btnInput = document.getElementById("excelInput");
      btnInput.disabled = true;

      let totalImportados = 0;
      const chunkSize = 400;

      for (let i = 0; i < json.length; i += chunkSize) {
        const chunk = json.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (let row of chunk) {
          const keys = Object.keys(row);
          const nitKey = keys.find(k => k.trim().match(/^(nit|cc|documento|id|nit\/cc)$/i)) || keys[0];
          const nit = String(row[nitKey] || "S/N").trim();

          const nameKey = keys.find(k => k.trim().match(/^(nombre|razon social|razón social|cliente|empresa|tercero|nombres)$/i));
          const nombre = nameKey ? String(row[nameKey]).trim() : (row[keys[1]] ? String(row[keys[1]]).trim() : "Sin Nombre");

          const tipoKey = keys.find(k => k.trim().match(/^(tipo|expediente|categoria)$/i));
          const tipo = tipoKey && String(row[tipoKey]).trim() ? String(row[tipoKey]).trim().toUpperCase() : "NORMAL";

          const ubiKey = keys.find(k => k.trim().match(/^(ubicacion|ubicación|posicion|destino)$/i));
          const ubicacion = ubiKey && String(row[ubiKey]).trim() ? String(row[ubiKey]).trim().toUpperCase() : "POR ASIGNAR";

          const estadoKey = keys.find(k => k.trim().match(/^(estado|estatus)$/i));
          const estado = estadoKey && String(row[estadoKey]).trim() 
            ? String(row[estadoKey]).trim().toUpperCase() 
            : (ubicacion === "POR ASIGNAR" ? "PENDIENTE" : "GUARDADO");

          const obsKey = keys.find(k => k.trim().match(/^(observaciones|observacion|notas|detalle)$/i));
          const obs = obsKey ? String(row[obsKey]).trim() : "";

          const docRef = doc(collection(db, "expedientes"));
          batch.set(docRef, {
            customId: "DOC-" + Math.floor(1000 + Math.random() * 9000),
            nit: nit,
            nombre: nombre || "Sin Nombre",
            tipo: tipo,
            ubicacion: ubicacion,
            estado: estado,
            observaciones: obs,
            fechaCreacion: new Date().toISOString(),
            ultimaModificacion: new Date().toISOString()
          });

          totalImportados++;
        }

        await batch.commit();
      }

      alert(`¡Importación exitosa! Se guardaron ${totalImportados} registros correctamente.`);
      e.target.value = "";
    } catch(err) {
      alert("Error al procesar el archivo Excel: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
};

document.getElementById("searchInput").oninput = () => renderTable();

document.getElementById("sortOrder").onchange = (e) => {
  currentSortOrder = e.target.value;
  renderTable();
};

document.querySelectorAll(".filter-badge").forEach(btn => {
  btn.onclick = (e) => {
    const type = e.target.getAttribute("data-filter-type");
    const val = e.target.getAttribute("data-filter");

    document.querySelectorAll(`.filter-badge[data-filter-type="${type}"]`).forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");

    if(type === "estado") currentFilterEstado = val;
    if(type === "ubicacion") currentFilterUbicacion = val;
    renderTable();
  };
});

document.getElementById("btnClearFilters").onclick = () => {
  currentFilterEstado = "TODOS";
  currentFilterUbicacion = "TODOS";
  currentSortOrder = "FECHA_ASC";
  document.getElementById("sortOrder").value = "FECHA_ASC";
  document.getElementById("searchInput").value = "";
  document.querySelectorAll(".filter-badge").forEach(b => b.classList.remove("active"));
  document.querySelector('.filter-badge[data-filter-type="estado"][data-filter="TODOS"]').classList.add("active");
  renderTable();
};

document.getElementById("btnExportPDF").onclick = () => {
  const element = document.getElementById("pdfContent");
  html2pdf().from(element).save("reporte-documental.pdf");
};
