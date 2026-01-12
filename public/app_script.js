let isAdmin = false;
let allAppointments = [];
let allUserAppointments = [];
let allAdminAppointments = [];
let selectedTrainer = null;
let selectedDate = null;
let selectedTime = null;
let currentMonth = new Date();
let pendingDeleteId = null;
let pendingDeleteType = null;
let editingAppointmentId = null;
let adminFilterTrainer = "";
let adminFilterDate = "";
let userFilterDate = "";
// Mogući termini u danu
const allTimeSlots = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];
const dayLabels = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"];

async function get(path) {
  const res = await fetch(path);
  if (res.status === 401) {
    location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function del(path) {
  const res = await fetch(path, { method: "DELETE" });
  if (res.status === 401) {
    location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function put(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showModal(title, message, type, onConfirm = null, showCancel = false) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = `modal ${type}-modal`;

  modal.innerHTML = `
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="modal-buttons">
            ${
              showCancel
                ? `<button class="modal-btn confirm" onclick="confirmDeleteFromModal()">Da</button>`
                : ""
            }
            <button class="modal-btn ${
              showCancel ? "cancel" : "close"
            }" onclick="closeModal()">
              ${showCancel ? "Ne" : "U redu"}
            </button>
          </div>
        `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function closeModal() {
  const overlay = document.querySelector(".modal-overlay");
  overlay?.remove();
  pendingDeleteId = null;
  pendingDeleteType = null;
}
// Funkcija za potvrdu brisanja
async function confirmDeleteFromModal() {
  const deleteId = pendingDeleteId;
  const deleteType = pendingDeleteType;

  console.log("confirmDeleteFromModal - ID:", deleteId, "Type:", deleteType);
  closeModal();

  try {
    if (deleteType === "user") {
      console.log("Deleting user appointment:", deleteId);
      await del(`/api/appointments/${deleteId}`);
      await loadAllAppointmentsForFiltering();
      await loadAppointments();
      updateTimeSlots();
    } else {
      console.log("Deleting admin appointment:", deleteId);
      await del(`/api/admin/appointments/${deleteId}`);
      await loadAdminAppointments();
    }

    showModal("Uspjeh", "Termin je uspješno obrisan!", "success-modal");
    setTimeout(() => closeModal(), 2000);
  } catch (e) {
    showModal("Pogreška", e.message, "error-modal");
  }
}
// Funkcija za učitavanje svih termina za filtriranje
async function loadAllAppointmentsForFiltering() {
  allAppointments = await get("/api/appointments/all");
}
// Funkcija za učitavanje trenera
async function loadTrainers() {
  const trainers = await get("/api/trainers");

  const grid = document.getElementById("personal"); 
  grid.innerHTML = ""; // očisti postojeće

  trainers.forEach((t) => {
    const card = document.createElement("div");
    card.className = "trainer-card";

    // Boja border-a prema tipu
    if (t.type === "personal") card.style.border = "2px solid green";
    else if (t.type === "group") card.style.border = "2px solid orange";
    else if (t.type === "rehabilitation") card.style.border = "2px solid blue";

    card.dataset.trainerId = t.id;
    card.onclick = () => selectTrainer(t.id, card);

    const avatar = document.createElement("div");
    avatar.className = "trainer-avatar";

    if (t.profile_pic) {
      const img = document.createElement("img");
      img.src = t.profile_pic;
      img.alt = `${t.name} ${t.surname}`;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      avatar.appendChild(img);
    } else {
      const initials = `${(t.name || "").charAt(0)}${(t.surname || "").charAt(
        0
      )}`.toUpperCase();
      avatar.textContent = initials || "TR";
    }

    const name = document.createElement("div");
    name.className = "trainer-name";
    name.textContent = `${t.name} ${t.surname}`;

    const typeLabel = document.createElement("div");
    typeLabel.className = "trainer-type";
    typeLabel.textContent = t.type; 
    typeLabel.style.fontSize = "12px";
    typeLabel.style.color = "#555";

    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(typeLabel);
    grid.appendChild(card);
  });
}
function highlightSelectedTrainer() {
  if (!selectedTrainer) return;

  document.querySelectorAll(".trainer-card").forEach((card) => {
    const id = card.dataset.trainerId;
    if (String(id) === String(selectedTrainer)) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}



// Funkcija za odabir trenera
// preserveSelection: if true, do not clear selectedDate/selectedTime or hide booking UI


function selectTrainer(trainerId, el, preserveSelection = false) {
  // U EDIT MODU — NEMA TOGGLE LOGIKE
  if (preserveSelection) {
    selectedTrainer = trainerId;

    document.querySelectorAll(".trainer-card").forEach((card) => {
      card.classList.remove("selected");
    });

    if (el) el.classList.add("selected");
    
    // Ako je odabrano vrijeme zauzeto za novog trenera – resetiraj samo vrijeme
    if (
      selectedDate &&
      selectedTime &&
      isTimeBlockedForTrainer(selectedTrainer, selectedDate, selectedTime)
    ) {
      selectedTime = null;
    }

    document.getElementById("calendarContainer").style.display = "block";
    renderCalendar();

    console.log("Edit mode – trener označen:", selectedTrainer);
    return;
  }
  // Ako je kliknuti trener već odabran, odznači ga
  if (selectedTrainer === trainerId) {
    selectedTrainer = null;
    if (el) el.classList.remove("selected");
  } else {
    selectedTrainer = trainerId;

    // Ukloni "selected" sa svih kartica (sve kategorije)
    document.querySelectorAll(".trainer-card").forEach((card) => {
      card.classList.remove("selected");
    });

    // Označi kliknutog trenera
    if (el) el.classList.add("selected");
  }

/*   if (!preserveSelection) {
    selectedDate = null;
    selectedTime = null;
    currentMonth = new Date();
  } */

  // Prikaži kalendar i resetiraj time slotove
  document.getElementById("calendarContainer").style.display = "block";
  renderCalendar();

  document.getElementById("timeSlots").style.display = "none";
  document.getElementById("bookFinal").style.display = "none";

  console.log("Odabrani trener:", selectedTrainer);
}

//funkcija za kalendar i odabir datuma
function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthYear = document.getElementById("monthYear");

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthYear.textContent = new Date(year, month).toLocaleDateString("hr-HR", {
    month: "long",
    year: "numeric",
  });

  grid.innerHTML = "";

  // Dodavanje oznaka dana u tjednu
  dayLabels.forEach((label) => {
    const div = document.createElement("div");
    div.className = "calendar-day day-label";
    div.textContent = label;
    grid.appendChild(div);
  });
  // Prvi dan u mjesecu i broj dana u mjesecu
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // prazna polja prije prvog dana mjeseca
  for (let i = 0; i < firstDay; i++) {
    const div = document.createElement("div");
    div.className = "calendar-day disabled";
    grid.appendChild(div);
  }

  // dohvacanje dana u trenutnom mjesecu
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);

    const dateYear = date.getFullYear();
    const dateMonth = String(date.getMonth() + 1).padStart(2, "0");
    const dateDay = String(date.getDate()).padStart(2, "0");
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

    const isPast = date < today;

    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = day;

    if (isPast) {
      div.classList.add("disabled");
    } else {
      if (date.getTime() === today.getTime()) {
        div.classList.add("today");
      }
      if (selectedDate === dateStr) {
        div.classList.add("selected");
      }
      div.onclick = () => selectDate(dateStr);
    }

    grid.appendChild(div);
  }
}
// Funkcija za odabir datuma
function selectDate(dateStr) {
  selectedDate = dateStr;
  selectedTime = null;
  renderCalendar();
  updateTimeSlots();
  updateBookButton();
}
// Funkcija za update dostupnih termina
function updateTimeSlots() {
  const container = document.getElementById("timeSlots");
  const grid = document.getElementById("timeGrid");

  if (!selectedTrainer || !selectedDate) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  grid.innerHTML = "";

  const appointments = allAppointments; // sve rezervacije (trenere)
  const userAppointments = allUserAppointments; // sve korisnikove rezervacije
  console.log("updateTimeSlots:", {
    selectedTrainer,
    selectedDate,
    appointments,
    userAppointments,
  });

  // Trenerovi termini
  const trainerAppointments = allAppointments.filter(
    (a) => String(a.trainer_id) === String(selectedTrainer)
  );
  // Blokirana vremena za trenera
  const bookedTimes = new Set();
  appointments.forEach((a) => {
    // ignore the appointment currently being edited
    if (editingAppointmentId && String(a.id) === String(editingAppointmentId))
      return;
    if (String(a.trainer_id) === String(selectedTrainer)) {
      const apptDate = new Date(a.scheduled_at);
      const dateStr = apptDate.toISOString().split("T")[0];
      if (dateStr === selectedDate) {
        const time = apptDate.toTimeString().slice(0, 5);
        bookedTimes.add(time);
      }
    }
  });

  function isTimeBlockedForTrainer(trainerId, date, time) {
    if (!trainerId || !date || !time) return false;

    return allAppointments.some((a) => {
      if (editingAppointmentId && String(a.id) === String(editingAppointmentId))
        return false;

      const apptDate = new Date(a.scheduled_at);
      const dateStr = apptDate.toISOString().split("T")[0];
      const timeStr = apptDate.toTimeString().slice(0, 5);

      return (
        String(a.trainer_id) === String(trainerId) &&
        dateStr === date &&
        timeStr === time
      );
    });
  }


  // Blokirana vremena za korisnika
  const userBookedTimes = new Set();
  userAppointments.forEach((a) => {
    // ignore the appointment currently being edited
    if (editingAppointmentId && String(a.id) === String(editingAppointmentId))
      return;
    const apptDate = new Date(a.scheduled_at);
    const dateStr = apptDate.toISOString().split("T")[0];
    if (dateStr === selectedDate) {
      const time = apptDate.toTimeString().slice(0, 5);
      userBookedTimes.add(time);
    }
  });

  // Buttoni za sve termine
  allTimeSlots.forEach((time) => {
    const btn = document.createElement("button");
    btn.className = "time-btn";
    btn.textContent = time;

    const isTrainerBlocked = bookedTimes.has(time);
    const isUserBlocked = userBookedTimes.has(time);

    // Check for past times and 24h rule
    const candidate = new Date(`${selectedDate}T${time}:00`);
    const now = new Date();
    const ms24 = 24 * 60 * 60 * 1000;
    let inPast = candidate <= now;
    let lessThan24 = candidate - now < ms24;

    // If editing and this slot equals the original appointment, allow it
    if (editingAppointmentId) {
      const editingAppt =
        (allUserAppointments || []).find(
          (a) => String(a.id) === String(editingAppointmentId)
        ) ||
        (allAppointments || []).find(
          (a) => String(a.id) === String(editingAppointmentId)
        );
      if (editingAppt) {
        const editDt = new Date(editingAppt.scheduled_at);
        if (editDt.toISOString() === candidate.toISOString()) {
          inPast = false;
          lessThan24 = false;
        }
      }
    }

    // Determine disabled state
    btn.disabled = isTrainerBlocked || isUserBlocked || inPast || lessThan24;

    // Title priority: user conflict > trainer conflict > past > <24h
    if (isUserBlocked) {
      btn.title = "Već imate termin u ovom vremenu";
    } else if (isTrainerBlocked) {
      btn.title = "Trener je zauzet u ovom terminu";
    } else if (inPast) {
      btn.title = "Ne možete rezervirati termin u prošlosti";
    } else if (lessThan24) {
      btn.title =
        "Rezervacije i izmjene moraju biti najmanje 24 sata unaprijed";
    } else {
      btn.title = "";
    }

    if (selectedTime === time) btn.classList.add("selected");
    if (!btn.disabled) btn.onclick = () => selectTime(time);

    grid.appendChild(btn);
  });
}

// Funkcija za odabir vremena i update buttona
function selectTime(time) {
  selectedTime = time;
  updateTimeSlots();
  updateBookButton();
}

function updateBookButton() {
  const btn = document.getElementById("bookBtn");
  const container = document.getElementById("bookFinal");
  const cancelBtn = document.getElementById("cancelEditBtn");

  // Update label depending on edit mode
  btn.textContent = editingAppointmentId
    ? "Spremi promjene"
    : "Rezerviraj termin";

  // show/hide cancel button when in edit mode
  if (cancelBtn) {
    cancelBtn.style.display = editingAppointmentId ? "inline-block" : "none";
  }

  if (!selectedTrainer || !selectedDate || !selectedTime) {
    btn.disabled = true;
    btn.title = "";
    container.style.display =
      selectedTrainer && selectedDate ? "block" : "none";
    return;
  }

  container.style.display = "block";

  // Provjera konflikta u lokalnom array-u
  const hasConflict = allUserAppointments.some((a) => {
    const dateStr = new Date(a.scheduled_at).toISOString().split("T")[0];
    const timeStr = new Date(a.scheduled_at).toTimeString().slice(0, 5);
    return dateStr === selectedDate && timeStr === selectedTime;
  });
  if (hasConflict) {
    btn.disabled = true;
    btn.title = "Već imate termin u ovom vremenu";
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  } else {
    btn.disabled = false;
    btn.title = "";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }
}

function fmt(dt) {
  const d = new Date(dt);
  return d.toLocaleString("hr-HR");
}

function startEditAppointment(id) {
  console.log("startEditAppointment called with id:", id);
  try {
    const appt = allUserAppointments.find((a) => String(a.id) === String(id));
    if (!appt) return alert("Termin nije pronađen");

    editingAppointmentId = appt.id;

    // Set selected trainer and highlight card
    selectedTrainer = appt.trainer_id;
    highlightSelectedTrainer();
     document.getElementById("calendarContainer").style.display = "block";


    // 2️⃣ datum
    const dt = new Date(appt.scheduled_at);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    selectedDate = `${year}-${month}-${day}`;
    currentMonth = new Date(year, dt.getMonth(), 1);
    renderCalendar();

    // 3️⃣ vrijeme
    selectedTime = dt.toTimeString().slice(0, 5);
    document.getElementById("timeSlots").style.display = "block";
    updateTimeSlots();
    updateBookButton();

    // Scroll into view the booking area
    document
      .getElementById("bookFinal")
      ?.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    console.error("startEditAppointment error", e);
    alert("Greška prilikom pokretanja uređivanja. Vidi konzolu.");
  }
}
// Ensure function is available for inline onclick handlers
window.startEditAppointment = startEditAppointment;

function cancelEdit() {
  // exit edit mode and reset selection so user can make a new reservation
  editingAppointmentId = null;
  selectedTrainer = null;
  selectedDate = null;
  selectedTime = null;

  // clear UI selections
  document
    .querySelectorAll(".trainer-card")
    .forEach((c) => c.classList.remove("selected"));
  document.getElementById("calendarContainer").style.display = "none";
  document.getElementById("timeSlots").style.display = "none";

  updateTimeSlots();
  updateBookButton();
}
window.cancelEdit = cancelEdit;

async function loadAppointments() {
  try {
    console.log("Fetching appointments...");
    const res = await get("/api/appointments");

    // Normaliziraj odgovor u array
    allUserAppointments = Array.isArray(res)
      ? res
      : Array.isArray(res.appointments)
      ? res.appointments
      : [];

    console.log("Loaded user appointments:", allUserAppointments);
    renderFilteredUserAppointments();
    updateTimeSlots();
    updateBookButton();
  } catch (e) {
    console.error("Error loading appointments:", e);
  }
}

function renderFilteredUserAppointments() {
  const wrap = document.getElementById("apptList");
  let list = [...allUserAppointments];

  console.log("Rendering with list:", list);

  // Apply date filter
  if (userFilterDate) {
    list = list.filter((a) => {
      const apptDate = new Date(a.scheduled_at);
      const filterDate = new Date(userFilterDate);
      return apptDate.toDateString() === filterDate.toDateString();
    });
  }

  // Sortiranje termina po datumu i vremenu
  list.sort((a, b) => {
    const timeA = new Date(a.scheduled_at).getTime();
    const timeB = new Date(b.scheduled_at).getTime();
    return timeA - timeB;
  });

  if (!list || list.length === 0) {
    wrap.textContent = "Još nema termina.";
    return;
  }
  const rows = list
    .map((a) => {
      const d = new Date(a.scheduled_at);
      const dateOnly = d.toLocaleDateString("hr-HR");
      const timeOnly = d.toTimeString().slice(0, 5);
      return `
              <tr>
                <td>${dateOnly}</td>
                <td>${timeOnly}</td>
                <td>${a.trainer_name} ${a.trainer_surname}</td>
                <td>
                  <button class="edit-btn" onclick="startEditAppointment(${a.id})">Uredi</button>
                  <button class="del-btn" onclick="showDeleteConfirm(${a.id}, 'user')">Obriši</button>
                </td>
              </tr>`;
    })
    .join("");
  wrap.innerHTML = `<table><thead><tr><th>Datum</th><th>Vrijeme</th><th>Trener</th><th>Radnja</th></tr></thead><tbody>${rows}</tbody></table>`;
}
//funkcije za admin panel
async function loadAdminAppointments() {
  if (!isAdmin) return;
  allAdminAppointments = await get("/api/admin/appointments");
  if (!Array.isArray(allAdminAppointments)) {
    allAdminAppointments = allAdminAppointments.appointments || [];
  }
  renderFilteredAdminAppointments();
}
//funkcija za prikaz admin termina s filtriranjem
function renderFilteredAdminAppointments() {
  const wrap = document.getElementById("adminApptList");
  if (!Array.isArray(allAdminAppointments)) allAdminAppointments = [];
  let list = [...allAdminAppointments];
  // trener filter
  if (adminFilterTrainer) {
    list = list.filter((a) => a.trainer_id == adminFilterTrainer);
  }

  // datum filter
  if (adminFilterDate) {
    list = list.filter((a) => {
      const apptDate = new Date(a.scheduled_at);
      const filterDate = new Date(adminFilterDate);
      return apptDate.toDateString() === filterDate.toDateString();
    });
  }

  if (!list || list.length === 0) {
    wrap.textContent = "Nema termina koji odgovaraju filtrima.";
    return;
  }

  const rows = list
    .map((a) => {
      return;
      `<tr>
                <td>${fmt(a.scheduled_at)}</td>
                <td>${a.user_name} ${a.user_surname} (${a.user_email})</td>
                <td>${a.trainer_name} ${a.trainer_surname}</td>
                <td><button class="del-btn" onclick="showDeleteConfirm(${
                  a.id
                }, 'admin')">Obriši</button></td>
              </tr>`;
    })
    .join("");
  wrap.innerHTML = `<table><thead><tr><th>Vrijeme</th><th>Korisnik</th><th>Trener</th><th>Radnja</th></tr></thead><tbody>${rows}</tbody></table>`;
}
//funkcija za popunjavanje dropdowna trenera u admin panelu
async function populateAdminTrainerFilter() {
  const trainers = await get("/api/trainers");
  const select = document.getElementById("adminTrainerFilter");
  trainers.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} ${t.surname}`;
    select.appendChild(opt);
  });
}
//funkcija za prikaz potvrde brisanja
function showDeleteConfirm(id, type) {
  console.log("showDeleteConfirm called with ID:", id, "Type:", type);
  pendingDeleteId = id;
  pendingDeleteType = type;
  showModal(
    "Brisanje termina",
    "Jeste li sigurni da želite obrisati ovaj termin?",
    "error-modal",
    true,
    true
  );
}
//event listeners za navigaciju kalendarom, rezervaciju termina i odjavu
document.getElementById("prevMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
  selectedDate = null;
  selectedTime = null;
  updateTimeSlots();
  updateBookButton();
});
//navigacija na sljedeci mjesec
document.getElementById("nextMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
  selectedDate = null;
  selectedTime = null;
  updateTimeSlots();
  updateBookButton();
});
//rezervacija termina
document.getElementById("bookBtn").addEventListener("click", async () => {
  const err = document.getElementById("bookErr");
  const success = document.getElementById("bookSuccess");
  err.textContent = "";
  success.textContent = "";

  try {
    if (!selectedTrainer || !selectedDate || !selectedTime) {
      throw new Error("Molimo odaberite trenera, datum i vrijeme");
    }

    // Provjera konflikata u array-u (ignoriraj termin koji se uređuje)
    const conflictExists = allUserAppointments.some((a) => {
      if (editingAppointmentId && String(a.id) === String(editingAppointmentId))
        return false;
      const appt = new Date(a.scheduled_at);
      const dateStr = appt.toISOString().split("T")[0];
      const timeStr = appt.toTimeString().slice(0, 5);
      return dateStr === selectedDate && timeStr === selectedTime;
    });

    if (conflictExists) {
      throw new Error("Već imate termin u odabrano vrijeme i datum");
    }

    // Konvertiraj u ISO format
    const iso = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();

    if (editingAppointmentId) {
      // Update existing appointment
      const updated = await put(`/api/appointments/${editingAppointmentId}`, {
        trainerId: selectedTrainer,
        scheduledAt: iso,
      });

      // Update local arrays
      const idxUser = allUserAppointments.findIndex(
        (a) => String(a.id) === String(editingAppointmentId)
      );
      if (idxUser > -1) allUserAppointments[idxUser] = updated;
      const idxAll = allAppointments.findIndex(
        (a) => String(a.id) === String(editingAppointmentId)
      );
      if (idxAll > -1) allAppointments[idxAll] = updated;

      updateTimeSlots();
      renderFilteredUserAppointments();
      updateBookButton();

      success.textContent = "Termin je uspješno ažuriran!";
      setTimeout(() => {
        success.textContent = "";
      }, 2000);

      editingAppointmentId = null;
      // restore button label and update cancel visibility
      document.getElementById("bookBtn").textContent = "Rezerviraj termin";
      updateBookButton();
    } else {
      // Pošalji zahtjev za novi termin
      const newAppt = await post("/api/appointments", {
        trainerId: selectedTrainer,
        scheduledAt: iso,
      });

      // Ažuriraj lokalne podatke
      allUserAppointments.push(newAppt);
      allAppointments.push(newAppt);

      updateTimeSlots();
      renderFilteredUserAppointments();
      updateBookButton();

      success.textContent = "Termin je uspješno rezerviran!";
      setTimeout(() => {
        success.textContent = "";
      }, 2000);
    }
  } catch (e) {
    err.textContent = e.message;
  }
});
//odjava korisnika
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await post("/api/logout", {});
  location.href = "/";
});

// User filter event listeners
document.getElementById("userDateFilter")?.addEventListener("change", (e) => {
  userFilterDate = e.target.value;
  renderFilteredUserAppointments();
});
// Clear user filters
document
  .getElementById("clearUserFiltersBtn")
  ?.addEventListener("click", () => {
    userFilterDate = "";
    document.getElementById("userDateFilter").value = "";
    renderFilteredUserAppointments();
  });

// Admin filter event listeners
document
  .getElementById("adminTrainerFilter")
  ?.addEventListener("change", (e) => {
    adminFilterTrainer = e.target.value;
    renderFilteredAdminAppointments();
  });
// Admin date filter
document.getElementById("adminDateFilter")?.addEventListener("change", (e) => {
  adminFilterDate = e.target.value;
  renderFilteredAdminAppointments();
});
// Clear admin filters
document.getElementById("clearFiltersBtn")?.addEventListener("click", () => {
  adminFilterTrainer = "";
  adminFilterDate = "";
  document.getElementById("adminTrainerFilter").value = "";
  document.getElementById("adminDateFilter").value = "";
  renderFilteredAdminAppointments();
});

// init
(async () => {
  try {
    console.log("Loading user info...");
    const me = await get("/api/me");
    console.log("User info loaded:", me);
    isAdmin = me.is_admin;

    if (isAdmin) {
      console.log("Loading admin panel...");
      document.getElementById("pageTitle").textContent = "Admin panel";
      document.getElementById("bookingPanel").hidden = true;
      document.getElementById("userApptPanel").hidden = true;
      document.getElementById("adminPanel").hidden = false;
      await populateAdminTrainerFilter();
      await loadAdminAppointments();
      console.log("Admin panel loaded");
    } else {
      console.log("Loading user panel...");
      await loadAllAppointmentsForFiltering();
      console.log("All appointments loaded");
      await loadTrainers();
      highlightSelectedTrainer();
      console.log("Trainers loaded");
      await loadAppointments();
      console.log("User appointments loaded");
    }
  } catch (e) {
    console.error("Init error:", e);
    alert("Error loading data: " + (e.message || e));
  }
})();