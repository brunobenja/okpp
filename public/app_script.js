let isAdmin = false;
let allAppointments = [];
let allUserAppointments = [];
let allAdminAppointments = [];
let selectedTrainer = null;
let selectedServiceId = null;
let selectedDate = null;
let selectedTime = null;
let currentMonth = new Date();
let pendingDeleteId = null;
let pendingDeleteType = null;
let pendingEditId = null;
let adminFilterTrainer = "";
let adminFilterDate = "";
let userFilterDate = "";
let userFilterService = "";
let cachedTrainers = [];
let services = [];
let filterServiceId = null;
let filterTrainerType = null;
let filterDateVal = "";
let filterTimeVal = "";
let allTrainers = [];
let serviceChart = null;
let trainerChart = null;
let defaultWorkHours = { open_hour: 8, close_hour: 20 };
let workHours = { open_hour: 8, close_hour: 20 };
let workHoursSource = "global";
let adminReserveHours = { open_hour: 8, close_hour: 20 };
let allTimeSlots = [];
const dayLabels = ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"];
let historyMode = false;
let adminServiceChart = null;
let adminTrainerChart = null;
let peakHoursChart = null;
let cancellationsChart = null;
function padHour(n) {
  return String(n).padStart(2, "0");
}

function buildTimeSlots() {
  const open = Number(workHours.open_hour ?? 8);
  const close = Number(workHours.close_hour ?? 20);
  const slots = [];
  for (let h = open; h <= close; h++) {
    slots.push(`${padHour(h)}:00`);
  }
  allTimeSlots = slots;
}

function updateWorkHoursDisplay() {
  const userDisplay = document.getElementById("workHoursDisplay");
  if (userDisplay) {
    const label =
      workHoursSource === "override"
        ? "Radno vrijeme trenera (raspon)"
        : workHoursSource === "trainer"
        ? "Radno vrijeme trenera"
        : "Radno vrijeme";
    userDisplay.textContent = `${label}: ${padHour(
      workHours.open_hour
    )}:00 - ${padHour(workHours.close_hour)}:00`;
  }
  const adminDisplay = document.getElementById("currentWorkHoursAdmin");
  if (adminDisplay) {
    adminDisplay.textContent = `Trenutno: ${padHour(
      workHours.open_hour
    )}:00 - ${padHour(workHours.close_hour)}:00`;
  }
  const openInput = document.getElementById("workOpen");
  const closeInput = document.getElementById("workClose");
  if (openInput) openInput.value = `${padHour(workHours.open_hour)}:00`;
  if (closeInput) closeInput.value = `${padHour(workHours.close_hour)}:00`;
}

async function fetchTrainerWorkHours(trainerId, dateStr = "") {
  if (!trainerId) return null;
  try {
    const query = dateStr ? `?date=${encodeURIComponent(dateStr)}` : "";
    const res = await get(`/api/trainer/${trainerId}/work-hours${query}`);
    return res;
  } catch (e) {
    console.warn("Ne mogu učitati radno vrijeme trenera", e);
    return null;
  }
  console.log(await fetchTrainerWorkHours(selectedTrainer, ""));
}

async function applyTrainerHours(trainerId, dateStr = "") {
  console.log("applyTrainerHours called", { trainerId, dateStr });
  const hours = trainerId
    ? await fetchTrainerWorkHours(trainerId, dateStr)
    : null;
    console.log("Fetched trainer hours:", hours);
  if (
    hours &&
    hours.open_hour !== undefined &&
    hours.close_hour !== undefined
  ) {
    console.log("No trainer hours found, using default 8-20");
    workHours = {
      open_hour: Number(hours.open_hour),
      close_hour: Number(hours.close_hour),
    };
    workHoursSource = hours.source || "trainer";
  } else {
    workHours = { ...defaultWorkHours };
    workHoursSource = "global";
  }
    console.log("Work hours applied:", workHours, "source:", workHoursSource);
  buildTimeSlots();
  updateWorkHoursDisplay();
  if (selectedDate) updateTimeSlots();
}

async function getEffectiveTrainerHours(trainerId, dateStr = "") {
  const hours = trainerId
    ? await fetchTrainerWorkHours(trainerId, dateStr)
    : null;
  if (
    hours &&
    hours.open_hour !== undefined &&
    hours.close_hour !== undefined
  ) {
    return {
      open_hour: Number(hours.open_hour),
      close_hour: Number(hours.close_hour),
    };
  }
  return { ...defaultWorkHours };
}

async function loadWorkHours() {
  try {
    const hours = await get("/api/work-hours");
    defaultWorkHours = {
      open_hour: Number(hours.open_hour ?? 8),
      close_hour: Number(hours.close_hour ?? 20),
    };
    workHours = { ...defaultWorkHours };
    workHoursSource = "global";
  } catch (e) {
    console.warn("Unable to load work hours, using defaults", e);
    defaultWorkHours = { open_hour: 8, close_hour: 20 };
    workHours = { ...defaultWorkHours };
    workHoursSource = "global";
  }
  buildTimeSlots();
  updateWorkHoursDisplay();
}

function toggleHistory() {
  historyMode = !historyMode;
  const currentView = document.getElementById("currentView");
  const historyView = document.getElementById("historyView");
  const bookingPanel = document.getElementById("bookingPanel");
  const historyBtn = document.getElementById("historyToggle");
  const userApptTitle = document.getElementById("userApptTitle");
  const bookingTitle = document.getElementById("bookingTitle");
  const mainContent = document.getElementById("mainContent");

  if (historyMode) {
    // Show history
    currentView.style.display = "none";
    historyView.style.display = "block";
    bookingPanel.style.display = "none";
    historyBtn.classList.add("active");
    userApptTitle.textContent = "Povijest termina";
    mainContent.classList.add("history-active");
    renderHistoryTab();
  } else {
    // Show current appointments and booking
    currentView.style.display = "block";
    historyView.style.display = "none";
    bookingPanel.style.display = "block";
    historyBtn.classList.remove("active");
    userApptTitle.textContent = "Moji termini";
    mainContent.classList.remove("history-active");
  }
}

function renderHistoryTab() {
  const now = new Date();
  const pastAppointments = allUserAppointments.filter((a) => {
    return new Date(a.scheduled_at) < now;
  });

  // Update stats
  document.getElementById("totalPastAppts").textContent =
    pastAppointments.length;

  // Calculate service statistics
  const serviceStats = {};
  pastAppointments.forEach((a) => {
    const service = a.service_name || "Nepoznato";
    serviceStats[service] = (serviceStats[service] || 0) + 1;
  });

  // Calculate trainer statistics
  const trainerStats = {};
  pastAppointments.forEach((a) => {
    const trainer = `${a.trainer_name} ${a.trainer_surname}`;
    trainerStats[trainer] = (trainerStats[trainer] || 0) + 1;
  });

  // Find favorites
  let favService = "-";
  let maxServiceCount = 0;
  Object.entries(serviceStats).forEach(([service, count]) => {
    if (count > maxServiceCount) {
      maxServiceCount = count;
      favService = service;
    }
  });

  let favTrainerName = "-";
  let maxTrainerCount = 0;
  Object.entries(trainerStats).forEach(([trainer, count]) => {
    if (count > maxTrainerCount) {
      maxTrainerCount = count;
      favTrainerName = trainer;
    }
  });

  document.getElementById("favService").textContent = favService;
  document.getElementById("favTrainer").textContent = favTrainerName;

  // Render charts
  renderServiceChart(serviceStats);
  renderTrainerChart(trainerStats);

  // Render past appointments list
  renderPastAppointmentsList(pastAppointments);
}

function renderServiceChart(serviceStats) {
  const ctx = document.getElementById("serviceChart");
  if (!ctx) return;

  if (serviceChart) {
    serviceChart.destroy();
  }

  const labels = Object.keys(serviceStats);
  const data = Object.values(serviceStats);

  if (labels.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  serviceChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: [
            "#FF6384",
            "#36A2EB",
            "#FFCE56",
            "#4BC0C0",
            "#9966FF",
            "#FF9F40",
          ],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

function renderTrainerChart(trainerStats) {
  const ctx = document.getElementById("trainerChart");
  if (!ctx) return;

  if (trainerChart) {
    trainerChart.destroy();
  }

  const labels = Object.keys(trainerStats);
  const data = Object.values(trainerStats);

  if (labels.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  trainerChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Broj termina",
          data: data,
          backgroundColor: "#36A2EB",
          borderColor: "#2980B9",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
        x: {
          ticks: {
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 45,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `Termina: ${context.parsed.y}`;
            },
          },
        },
      },
    },
  });
}

function renderPastAppointmentsList(pastAppointments) {
  const wrap = document.getElementById("pastApptList");

  if (!pastAppointments || pastAppointments.length === 0) {
    wrap.textContent = "Još nema prošlih termina.";
    return;
  }

  // Sort by date (newest first)
  pastAppointments.sort((a, b) => {
    return new Date(b.scheduled_at) - new Date(a.scheduled_at);
  });

  const rows = pastAppointments
    .map(
      (a) => `
          <tr>
            <td>${fmt(a.scheduled_at)}</td>
            <td>${a.service_name || "N/A"}</td>
            <td>${a.trainer_name} ${a.trainer_surname}</td>
          </tr>
        `
    )
    .join("");

  wrap.innerHTML = `<table><thead><tr><th>Vrijeme</th><th>Usluga</th><th>Trener</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadAdminStatistics() {
  if (!isAdmin) return;
  try {
    const stats = await get("/api/admin/statistics");

    // Update summary stats
    document.getElementById("totalApptsAdmin").textContent =
      stats.totalAppointments;
    document.getElementById("totalCancellations").textContent =
      stats.totalCancellations;
    document.getElementById("recentCancellations").textContent =
      stats.recentCancellations;

    // Render charts
    renderAdminServiceChart(stats.serviceBreakdown);
    renderAdminTrainerChart(stats.trainerBreakdown);
    renderPeakHoursChart(stats.peakHours);
    renderCancellationsChart(stats.cancellationsByType);
  } catch (e) {
    console.error("Error loading admin statistics:", e);
  }
}

function renderAdminServiceChart(data) {
  const ctx = document.getElementById("adminServiceChart");
  if (!ctx) return;

  if (adminServiceChart) {
    adminServiceChart.destroy();
  }

  if (!data || data.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = data.map((d) => d.name || "Nepoznato");
  const values = data.map((d) => d.count);

  adminServiceChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            "#FF6384",
            "#36A2EB",
            "#FFCE56",
            "#4BC0C0",
            "#9966FF",
            "#FF9F40",
          ],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });
}

function renderAdminTrainerChart(data) {
  const ctx = document.getElementById("adminTrainerChart");
  if (!ctx) return;

  if (adminTrainerChart) {
    adminTrainerChart.destroy();
  }

  if (!data || data.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = data.map((d) => d.name);
  const values = data.map((d) => d.count);

  adminTrainerChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Broj termina",
          data: values,
          backgroundColor: "#36A2EB",
          borderColor: "#2980B9",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
        x: {
          ticks: {
            font: {
              size: 10,
            },
            maxRotation: 45,
            minRotation: 45,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });
}

function renderPeakHoursChart(data) {
  const ctx = document.getElementById("peakHoursChart");
  if (!ctx) return;

  if (peakHoursChart) {
    peakHoursChart.destroy();
  }

  if (!data || data.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = data.map((d) => `${String(d.hour).padStart(2, "0")}:00`);
  const values = data.map((d) => d.count);

  peakHoursChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Broj termina",
          data: values,
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "#4BC0C0",
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });
}

function renderCancellationsChart(data) {
  const ctx = document.getElementById("cancellationsChart");
  if (!ctx) return;

  if (cancellationsChart) {
    cancellationsChart.destroy();
  }

  if (!data || data.length === 0) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = data.map((d) => (d.type === "user" ? "Korisnik" : "Admin"));
  const values = data.map((d) => d.count);

  cancellationsChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#FF6384", "#36A2EB"],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 12,
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });
}

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

async function confirmDeleteFromModal() {
  // Save the values BEFORE closing modal
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
      await loadAdminStatistics();
    }

    showModal("Uspjeh", "Termin je uspješno obrisan!", "success-modal");
    setTimeout(() => closeModal(), 2000);
  } catch (e) {
    showModal("Pogreška", e.message, "error-modal");
  }
}

async function loadAllAppointmentsForFiltering() {
  allAppointments = await get("/api/appointments/all");
}


async function loadTrainers() {
  try {
    let url = "/api/trainers";
    const params = [];
    // Note: Service filtering is disabled since all trainers offer all services
    // if (filterServiceId) {
    //   params.push(`serviceId=${filterServiceId}`);
    // }
    if (filterTrainerType) {
      params.push(`trainer_type=${encodeURIComponent(filterTrainerType)}`);
    }
    if (params.length > 0) {
      url += "?" + params.join("&");
    }
    allTrainers = await get(url);
    renderFilteredTrainers();
  } catch (e) {
    console.error("Error loading trainers:", e);
  }
}

function renderFilteredTrainers() {
  const grid = document.getElementById("trainerGrid");
  grid.innerHTML = "";

  let trainers = [...allTrainers];
  const filterType = document.getElementById("filterTrainerType")?.value;
  if (filterType) {
    trainers = trainers.filter((t) => t.trainer_type === filterType);
  }

  if (trainers.length === 0) {
    grid.innerHTML =
      '<p style="color: #666; padding: 12px;">Nema dostupnih trenera za odabrane filtere.</p>';
    return;
  }

  trainers.forEach((t) => {
    const card = document.createElement("div");
    card.className = "trainer-card";
    card.onclick = () => selectTrainer(t.id, card);

    const avatar = document.createElement("div");
    avatar.className = "trainer-avatar";

    const imgUrl = t.profile_pic || t.pic;

    if (imgUrl) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.alt = `${t.name} ${t.surname}`;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      avatar.appendChild(img);
    } else {
      const initials =
        `${(t.name || "").charAt(0)}${(t.surname || "").charAt(
          0
        )}`.toUpperCase() || "TR";
      avatar.textContent = initials;
      avatar.style.backgroundColor = "#888";
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.fontWeight = "bold";
      avatar.style.color = "#fff";
      avatar.style.fontSize = "1.2rem";
      avatar.style.borderRadius = "50%";
    }

    const name = document.createElement("div");
    name.className = "trainer-name";
    name.textContent = `${t.name} ${t.surname}`;

    card.appendChild(avatar);
    card.appendChild(name);

    if (t.trainer_type) {
      const type = document.createElement("div");
      type.style.fontSize = "12px";
      type.style.color = "#666";
      type.style.marginTop = "4px";
      type.textContent = t.trainer_type;
      card.appendChild(type);
    }

    grid.appendChild(card);
  });
}
document
  .getElementById("filterTrainerType")
  ?.addEventListener("change", renderFilteredTrainers);

async function selectTrainer(trainerId, cardEl) {
  selectedTrainer = trainerId;
  selectedDate = null;
  selectedTime = null;
  selectedServiceId = services && services.length > 0 ? services[0].id : null;

  // Update UI
  document.querySelectorAll(".trainer-card").forEach((card) => {
    card.classList.remove("selected");
  });
  if (cardEl) cardEl.classList.add("selected");

  const calendarContainer = document.getElementById("calendarContainer");
  calendarContainer.style.display = "block";
  const servicePanel = document.getElementById("servicePanel");
  if (services && services.length > 0) {




    servicePanel.style.display = "block";






    // Show all services (no trainer-specific filtering in this system)
    const serviceSelect = document.getElementById("serviceSelect");
    serviceSelect.innerHTML = "";
    services.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.duration} min)`;
      serviceSelect.appendChild(opt);
    });
    if (services.length > 0) {
      selectedServiceId = services[0].id;
    }
  }
  currentMonth = new Date();
  await applyTrainerHours(trainerId, selectedDate || "");
  renderCalendar();

  document.getElementById("timeSlots").style.display = "none";
  document.getElementById("bookFinal").style.display = "none";
}

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

  // Day labels
  dayLabels.forEach((label) => {
    const div = document.createElement("div");
    div.className = "calendar-day day-label";
    div.textContent = label;
    grid.appendChild(div);
  });

  let firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Empty cells before month starts
  for (let i = 0; i < firstDay; i++) {
    const div = document.createElement("div");
    div.className = "calendar-day disabled";
    grid.appendChild(div);
  }

  // Days of month
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

async function selectDate(dateStr) {
    console.log(
      "selectDate clicked:",
      dateStr,
      "selectedTrainer:",
      selectedTrainer
    );
  selectedDate = dateStr;
  selectedTime = null;
  await applyTrainerHours(selectedTrainer, dateStr);
  renderCalendar();
  updateTimeSlots();
  updateBookButton();
}

function updateTimeSlots() {
  const container = document.getElementById("timeSlots");
  const grid = document.getElementById("timeGrid");

  if (!selectedTrainer || !selectedDate || !selectedServiceId) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  grid.innerHTML = "";
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selDuration = selectedService?.duration || 60;

  function parseTimeToDate(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  function overlaps(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  allTimeSlots.forEach((time) => {
    const btn = document.createElement("button");
    btn.className = "time-btn";
    btn.textContent = time;

    const slotStart = parseTimeToDate(selectedDate, time);
    const slotEnd = new Date(slotStart.getTime() + selDuration * 60000);
    const now = new Date();
    const diffMs = slotStart - now;

    // koristi let da možemo promijeniti vrijednost ako editiramo termin
    let lessThan24 = diffMs > 0 && diffMs < 24 * 60 * 60 * 1000;

    // Provjera preklapanja sa trenerovim terminima
    let isTrainerBlocked = allAppointments.some((a) => {
      if (a.trainer_id != selectedTrainer) return false;
      const apptDate = new Date(a.scheduled_at);
      if (apptDate.toISOString().split("T")[0] !== selectedDate) return false;
      const apptStart = apptDate;
      const apptEnd = new Date(
        apptStart.getTime() + (a.duration_minutes || 60) * 60000
      );
      return overlaps(slotStart, slotEnd, apptStart, apptEnd);
    });

    // Provjera preklapanja sa korisnikovim terminima
    let isUserBlocked = allUserAppointments.some((a) => {
      const apptDate = new Date(a.scheduled_at);
      if (apptDate.toISOString().split("T")[0] !== selectedDate) return false;
      const apptStart = apptDate;
      const apptEnd = new Date(
        apptStart.getTime() + (a.duration_minutes || 60) * 60000
      );
      return overlaps(slotStart, slotEnd, apptStart, apptEnd);
    });

    // Ako editiramo i slot je originalni termin, ignoriraj lessThan24
    if (editingAppointmentId) {
      const editingAppt =
        allUserAppointments.find(
          (a) => String(a.id) === String(editingAppointmentId)
        ) ||
        allAppointments.find(
          (a) => String(a.id) === String(editingAppointmentId)
        );

      if (
        editingAppt &&
        new Date(editingAppt.scheduled_at).toISOString() ===
          slotStart.toISOString()
      ) {
        lessThan24 = false;
      }
    }

    // Button disabled ako je user/trainer zauzet ili <24h
    btn.disabled = isTrainerBlocked || isUserBlocked || lessThan24;

    // Tooltip
    if (isUserBlocked) {
      btn.title = "Već imate termin u ovom periodu";
    } else if (isTrainerBlocked) {
      btn.title = "Trener je zauzet u ovom periodu";
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


function selectTime(time) {
  selectedTime = time;
  updateTimeSlots();
  updateBookButton();
}

function updateBookButton() {
  const btn = document.getElementById("bookBtn");
  const container = document.getElementById("bookFinal");

  if (selectedTrainer && selectedDate && selectedTime && selectedServiceId) {
    container.style.display = "block";

    const selectedService = services.find((s) => s.id === selectedServiceId);
    const selDuration = selectedService?.duration || 60;
    const slotStart = new Date(`${selectedDate}T${selectedTime}:00`);
    const slotEnd = new Date(slotStart.getTime() + selDuration * 60000);
    const hasConflict = allUserAppointments.some((a) => {
      const apptStart = new Date(a.scheduled_at);
      const apptEnd = new Date(
        apptStart.getTime() + (a.duration_minutes || 60) * 60000
      );
      return apptStart < slotEnd && slotStart < apptEnd;
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
  } else {
    if (selectedTrainer && selectedDate && selectedServiceId) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
    btn.disabled = true;
    btn.title = "";
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }
}

function fmt(dt) {
  const d = new Date(dt);
  return d.toLocaleString("hr-HR");
}

async function loadAppointments() {
  try {
    console.log("Fetching appointments from /api/appointments...");
    const data = await get("/api/appointments");
    console.log("Fetched appointments count:", data ? data.length : 0);
    console.log("Fetched appointments:", data);
    allUserAppointments = data || [];
    console.log("allUserAppointments is now:", allUserAppointments);
    console.log("About to call renderFilteredUserAppointments...");
    renderFilteredUserAppointments();
    console.log("renderFilteredUserAppointments completed");
  } catch (e) {
    console.error("Error loading appointments:", e);
    document.getElementById("apptList").textContent =
      "Greška pri učitavanju: " + e.message;
  }
}

function renderFilteredUserAppointments() {
  const wrap = document.getElementById("apptList");
  
  console.log("renderFilteredUserAppointments: wrap element:", wrap);

  if (!wrap) {
    console.error("apptList element not found!");
    return;
  }

  let list = [...allUserAppointments];
  console.log("Starting with list of", list.length, "appointments");

  // Filter only future appointments
  const now = new Date();
  console.log("Current date/time:", now);
  list = list.filter((a) => {
    const apptTime = new Date(a.scheduled_at);
    const isFuture = apptTime > now;
    console.log(
      `  Appointment ${a.id}: ${
        a.scheduled_at
      } (${apptTime}) vs now (${now}) = ${isFuture ? "FUTURE" : "PAST"}`
    );
    return isFuture;
  });

  console.log("After filtering future: list.length =", list.length);

  // Apply service filter
  if (userFilterService) {
    list = list.filter((a) => a.service_name === userFilterService);
  }

  // Apply date filter
  if (userFilterDate) {
    list = list.filter((a) => {
      const apptDate = new Date(a.scheduled_at);
      const filterDate = new Date(userFilterDate);
      return apptDate.toDateString() === filterDate.toDateString();
    });
  }

  // Sort by time
  list.sort((a, b) => {
    const timeA = new Date(a.scheduled_at).getTime();
    const timeB = new Date(b.scheduled_at).getTime();
    return timeA - timeB;
  });

  console.log("Final list.length after filters and sort:", list.length);

  if (!list || list.length === 0) {
    console.log("No appointments to display, showing message");
    wrap.textContent = "Još nema budućih termina.";
    return;
  }

  console.log("Building HTML table for", list.length, "appointments");
  const rows = list
    .map((a) => {
      const scheduledAt = new Date(a.scheduled_at);
      const now = new Date();
      const hoursUntilAppt = (scheduledAt - now) / (1000 * 60 * 60);
      const canCancel = hoursUntilAppt >= 24;

      const deleteButton = canCancel
        ? `<button class="del-btn" onclick="showDeleteConfirm(${a.id}, 'user')">Obriši</button>`
        : `<button class="del-btn" disabled title="Ne možete otkazati termin manje od 24 sata prije početka" style="opacity: 0.5; cursor: not-allowed;">Obriši</button>`;

      return `
          <tr>
            <td>${fmt(a.scheduled_at)}</td>
            <td>${a.service_name || "N/A"}</td>
            <td>${a.trainer_name} ${a.trainer_surname}</td>
            <td class="action-cell">
              <button class="confirm-btn" onclick="showEditModal(${
                a.id
              })">Uredi</button>
              ${deleteButton}
            </td>
          </tr>
        `;
    })
    .join("");

  const html = `<table><thead><tr><th>Vrijeme</th><th>Usluga</th><th>Trener</th><th>Radnja</th></tr></thead><tbody>${rows}</tbody></table>`;
  console.log("Setting innerHTML with table HTML");
  wrap.innerHTML = html;
  console.log("innerHTML set, table should be visible");
}

async function loadAdminAppointments() {
  if (!isAdmin) return;
  allAdminAppointments = await get("/api/admin/appointments");
  renderFilteredAdminAppointments();
}

function renderFilteredAdminAppointments() {
  const wrap = document.getElementById("adminApptList");
  let list = [...allAdminAppointments];

  // Apply trainer filter
  if (adminFilterTrainer) {
    list = list.filter((a) => a.trainer_id == adminFilterTrainer);
  }

  // Apply date filter
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
      return `<tr>
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

async function populateTrainerWorkHoursSelect() {
  const select = document.getElementById("trainerWorkHoursSelect");
  if (!select) return;
  select.innerHTML = '<option value="">Odaberite trenera...</option>';
  const trainers = allTrainers.length
    ? allTrainers
    : await get("/api/trainers");
  trainers.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} ${t.surname}`;
    select.appendChild(opt);
  });
}

async function refreshAdminReserveTimes() {
  const timeSelect = document.getElementById("adminReserveTimeSelect");
  if (!timeSelect) return;
  const trainerId = document.getElementById("adminReserveTrainerSelect")?.value;
  const serviceId = document.getElementById("adminReserveServiceSelect")?.value;
  const dateVal = document.getElementById("adminReserveDate")?.value || "";
  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration || 60;
  const hours = await getEffectiveTrainerHours(trainerId, dateVal);
  adminReserveHours = hours;
  timeSelect.innerHTML = '<option value="">Odaberite vrijeme...</option>';
  for (let h = hours.open_hour; h <= hours.close_hour; h++) {
    const label = `${padHour(h)}:00`;
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = `${label} (${duration} min)`;
    timeSelect.appendChild(opt);
  }
}

function setTrainerWorkHourInputs(hours) {
  const openInput = document.getElementById("trainerWorkOpen");
  const closeInput = document.getElementById("trainerWorkClose");
  if (openInput && hours) openInput.value = `${padHour(hours.open_hour)}:00`;
  if (closeInput && hours) closeInput.value = `${padHour(hours.close_hour)}:00`;
}

async function fetchTrainerAdminHours(trainerId, dateVal = "") {
  return get(
    `/api/admin/trainer/${trainerId}/work-hours${
      dateVal ? `?date=${encodeURIComponent(dateVal)}` : ""
    }`
  );
}

function renderTrainerHoursList(data) {
  const container = document.getElementById("trainerWorkHoursList");
  if (!container) return;
  if (!data) {
    container.innerHTML = "";
    return;
  }
  const { base, overrides, effective } = data;
  const parts = [];
  if (effective) {
    parts.push(
      `<div style="padding:8px; background:#e8f5e9; border-radius:6px; margin:8px 0;"><strong>Aktivno (${
        effective.source || "n/a"
      }):</strong> ${padHour(effective.open_hour)}:00 - ${padHour(
        effective.close_hour
      )}:00</div>`
    );
  }
  if (base) {
    parts.push(
      `<div style="padding:8px; background:#f0f4c3; border-radius:6px; margin:8px 0;"><strong>Osnovno:</strong> ${padHour(
        base.open_hour
      )}:00 - ${padHour(base.close_hour)}:00</div>`
    );
  }
  if (overrides && overrides.length) {
    const rows = overrides
      .map((o) => {
        const dateRange =
          o.start_date === o.end_date
            ? o.start_date
            : `${o.start_date} → ${o.end_date}`;
        return `<div style="padding:8px; background:#e3f2fd; border-left:4px solid #2d5f3f; margin:6px 0; border-radius:4px;">${dateRange}: <strong>${padHour(
          o.open_hour
        )}:00 - ${padHour(o.close_hour)}:00</strong></div>`;
      })
      .join("");
    parts.push(
      `<div style="margin:12px 0;"><strong>Iznimke:</strong>${rows}</div>`
    );
  }
  container.innerHTML = parts.join("");
}

async function loadTrainerWorkHoursForAdmin(trainerId) {
  const status = document.getElementById("trainerWorkHoursStatus");
  const dateVal = document.getElementById("trainerWorkStartDate")?.value || "";
  if (!trainerId) {
    setTrainerWorkHourInputs(defaultWorkHours);
    renderTrainerHoursList(null);
    if (status)
      status.textContent =
        "Odaberite trenera za prikaz radnog vremena (prikazano globalno).";
    return;
  }
  if (status) status.textContent = "Učitavam...";
  try {
    const detail = await fetchTrainerAdminHours(trainerId, dateVal);
    const hours = detail?.effective || detail?.base || null;
    if (hours && hours.open_hour !== undefined) {
      setTrainerWorkHourInputs(hours);
      if (status) status.textContent = "Prikazano radno vrijeme trenera.";
    } else {
      setTrainerWorkHourInputs(defaultWorkHours);
      if (status)
        status.textContent =
          "Nije postavljeno radno vrijeme; koristi se globalno.";
    }
    renderTrainerHoursList(detail);
  } catch (e) {
    if (status) status.textContent = e.message || "Greška pri učitavanju.";
  }
}

async function saveTrainerWorkHours() {
  const trainerId = document.getElementById("trainerWorkHoursSelect")?.value;
  const startDate = document.getElementById("trainerWorkStartDate")?.value;
  const openVal = document.getElementById("trainerWorkOpen")?.value;
  const closeVal = document.getElementById("trainerWorkClose")?.value;
  const status = document.getElementById("trainerWorkHoursStatus");
  if (status) status.textContent = "";
  if (!trainerId) {
    if (status) status.textContent = "Odaberite trenera.";
    return;
  }
  if (!openVal || !closeVal) {
    if (status) status.textContent = "Unesite početak i kraj.";
    return;
  }
  const openHour = Number(openVal.split(":")[0]);
  const closeHour = Number(closeVal.split(":")[0]);
  try {
    if (startDate) {
      const endDate = startDate;
      await put("/api/admin/trainer-work-hours-range", {
        trainerId,
        startDate,
        endDate,
        openHour,
        closeHour,
      });
      if (status) status.textContent = "Spremljeno za odabrani datum.";
    } else {
      await put("/api/admin/trainer-work-hours", {
        trainerId,
        openHour,
        closeHour,
      });
      if (status) status.textContent = "Spremljeno (osnovno radno vrijeme).";
    }
    // Refresh booking hours if this trainer is currently selected
    if (selectedTrainer && Number(selectedTrainer) === Number(trainerId)) {
      await applyTrainerHours(selectedTrainer, selectedDate || "");
    }
    await refreshAdminReserveTimes();
  } catch (e) {
    if (status) status.textContent = e.message || "Greška pri spremanju.";
  }
}

async function populateAdminReservationSelects() {
  // Populate clients
  try {
    const clients = await get("/api/admin/clients");
    const clientSelect = document.getElementById("adminClientSelect");
    if (clientSelect) {
      clients.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.name} ${c.surname} (${c.email})`;
        clientSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Error loading clients:", e);
  }

  // Populate trainers
  try {
    const trainers = await get("/api/trainers");
    const trainerSelect = document.getElementById("adminReserveTrainerSelect");
    if (trainerSelect) {
      trainers.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.name} ${t.surname}`;
        trainerSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Error loading trainers:", e);
  }

  // Populate services
  try {
    const svcList = await get("/api/services");
    services = svcList;
    const serviceSelect = document.getElementById("adminReserveServiceSelect");
    if (serviceSelect) {
      serviceSelect.innerHTML = "";
      svcList.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        serviceSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Error loading services:", e);
  }
}

async function handleAdminReservation() {
  const clientSelect = document.getElementById("adminClientSelect");
  const trainerSelect = document.getElementById("adminReserveTrainerSelect");
  const serviceSelect = document.getElementById("adminReserveServiceSelect");
  const dateInput = document.getElementById("adminReserveDate");
  const timeSelect = document.getElementById("adminReserveTimeSelect");
  const statusDiv = document.getElementById("adminReserveStatus");

  if (
    !clientSelect ||
    !trainerSelect ||
    !serviceSelect ||
    !dateInput ||
    !timeSelect ||
    !statusDiv
  ) {
    console.error("One or more form elements not found");
    return;
  }

  const userId = clientSelect.value;
  const trainerId = trainerSelect.value;
  const serviceId = serviceSelect.value;
  const dateStr = dateInput.value;
  const timeStr = timeSelect.value;

  if (!userId || !trainerId || !dateStr || !timeStr) {
    statusDiv.textContent = "Molimo popunite sva obavezna polja";
    statusDiv.style.color = "red";
    return;
  }

  const dt = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(dt.getTime())) {
    statusDiv.textContent = "Neispravan format datuma ili vremena.";
    statusDiv.style.color = "red";
    return;
  }
  const scheduledAt = dt.toISOString();

  try {
    statusDiv.textContent = "Dodavanje termina...";
    statusDiv.style.color = "blue";

    const result = await post("/api/admin/appointments", {
      userId: Number(userId),
      trainerId: Number(trainerId),
      scheduledAt,
      serviceId: serviceId || null,
    });

    statusDiv.textContent = "Termin je uspješno dodan!";
    statusDiv.style.color = "green";

    // Clear form
    document.getElementById("adminClientSelect").value = "";
    document.getElementById("adminReserveTrainerSelect").value = "";
    document.getElementById("adminReserveServiceSelect").value = "";
    document.getElementById("adminReserveDate").value = "";
    document.getElementById("adminReserveTimeSelect").value = "";

    // Refresh appointment lists
    await loadAdminAppointments();
    await loadUserAppointments();

    // Auto-clear message after 3 seconds
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 3000);
  } catch (e) {
    statusDiv.textContent = `Greška: ${e.message || "Nepoznata greška"}`;
    statusDiv.style.color = "red";
  }
}

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

async function showEditModal(id) {
  const appt = allUserAppointments.find((a) => a.id === id);
  if (!appt) return;
  pendingEditId = id;

  const current = new Date(appt.scheduled_at);
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  const hours = String(current.getHours()).padStart(2, "0");
  const mins = String(current.getMinutes()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hours}:${mins}`;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
          <h3>Uredi termin</h3>
          <p>Odaberite novi trener, uslugu, datum i vrijeme</p>
          <label>Trener</label>
          <select id="editTrainer"></select>
          <label>Usluga</label>
          <select id="editService"></select>
          <label>Datum</label>
          <input type="date" id="editDate" value="${dateStr}" />
          <label style="margin-top:12px;">Vrijeme</label>
          <select id="editTime"></select>
          <div class="modal-buttons" style="margin-top:16px;">
            <button class="modal-btn confirm" onclick="confirmEditFromModal()">Spremi</button>
            <button class="modal-btn cancel" onclick="closeModal()">Odustani</button>
          </div>
        `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Load trainers into dropdown, preselect current trainer
  await loadEditTrainers(appt.trainer_id);

  // Load services into dropdown
  const editService = document.getElementById("editService");
  editService.innerHTML = "";
  services.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.duration} min)`;
    // Preselect by name if available, else by matching duration
    if (appt.service_name && s.name === appt.service_name) opt.selected = true;
    editService.appendChild(opt);
  });
  if (!editService.value && services.length) {
    // fallback select based on duration or first service
    const matchByDuration = services.find(
      (s) => (appt.duration_minutes || 60) === s.duration
    );
    editService.value = matchByDuration ? matchByDuration.id : services[0].id;
  }

  // Populate time options with availability considering selected trainer/service and user conflicts
  const currentTrainerId = Number(document.getElementById("editTrainer").value);
  await populateEditTimeOptions(
    currentTrainerId,
    dateStr,
    appt.id,
    timeStr,
    editService.value
  );

  // Update times when date changes
  document.getElementById("editDate").addEventListener("change", async (e) => {
    const newDate = e.target.value;
    const trainerId = Number(document.getElementById("editTrainer").value);
    const svc = document.getElementById("editService").value;
    await populateEditTimeOptions(trainerId, newDate, appt.id, null, svc);
  });

  // Update times when trainer changes
  document
    .getElementById("editTrainer")
    .addEventListener("change", async (e) => {
      const trainerId = Number(e.target.value);
      const newDate = document.getElementById("editDate").value || dateStr;
      const svc = document.getElementById("editService").value;
      await populateEditTimeOptions(trainerId, newDate, appt.id, null, svc);
    });

  // Update times when service changes
  document
    .getElementById("editService")
    .addEventListener("change", async (e) => {
      const trainerId = Number(document.getElementById("editTrainer").value);
      const newDate = document.getElementById("editDate").value || dateStr;
      await populateEditTimeOptions(
        trainerId,
        newDate,
        appt.id,
        null,
        e.target.value
      );
    });
}

async function loadEditTrainers(currentTrainerId) {
  try {
    const trainers = await get("/api/trainers");
    cachedTrainers = trainers;
    const select = document.getElementById("editTrainer");
    if (!select) return;
    select.innerHTML = "";
    trainers.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} ${t.surname}`;
      if (String(t.id) === String(currentTrainerId)) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Error loading trainers for edit modal:", e);
  }
}

async function populateEditTimeOptions(
  trainerId,
  dateStr,
  currentApptId,
  selectedTime,
  serviceId
) {
  const select = document.getElementById("editTime");
  if (!select) return;
  select.innerHTML = "";
  const selectedService = services.find((s) => s.id === serviceId);
  const selDuration = selectedService?.duration || 60;

  const hours = await getEffectiveTrainerHours(trainerId, dateStr);
  const slotList = [];
  for (let h = hours.open_hour; h <= hours.close_hour; h++) {
    slotList.push(`${padHour(h)}:00`);
  }
  if (!slotList.length) {
    const opt = document.createElement("option");
    opt.textContent = "Radno vrijeme nije postavljeno";
    opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
    return;
  }

  function overlaps(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  let firstEnabledSet = false;
  slotList.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    const slotStart = new Date(`${dateStr}T${t}:00`);
    const slotEnd = new Date(slotStart.getTime() + selDuration * 60000);

    let disabled = false;
    allAppointments.forEach((a) => {
      if (a.id === currentApptId) return; // skip current appt
      if (a.trainer_id == trainerId) {
        const apptStart = new Date(a.scheduled_at);
        const y = apptStart.getFullYear();
        const m = String(apptStart.getMonth() + 1).padStart(2, "0");
        const d = String(apptStart.getDate()).padStart(2, "0");
        const ds = `${y}-${m}-${d}`;
        if (ds === dateStr) {
          const apptEnd = new Date(
            apptStart.getTime() + (a.duration_minutes || 60) * 60000
          );
          if (overlaps(slotStart, slotEnd, apptStart, apptEnd)) disabled = true;
        }
      }
    });

    allUserAppointments.forEach((a) => {
      if (a.id === currentApptId) return; // skip current appt
      const apptStart = new Date(a.scheduled_at);
      const y = apptStart.getFullYear();
      const m = String(apptStart.getMonth() + 1).padStart(2, "0");
      const d = String(apptStart.getDate()).padStart(2, "0");
      const ds = `${y}-${m}-${d}`;
      if (ds === dateStr) {
        const apptEnd = new Date(
          apptStart.getTime() + (a.duration_minutes || 60) * 60000
        );
        if (overlaps(slotStart, slotEnd, apptStart, apptEnd)) disabled = true;
      }
    });

    opt.disabled = disabled;
    if (selectedTime === t && !disabled) {
      opt.selected = true;
      firstEnabledSet = true;
    }
    if (!selectedTime && !disabled && !firstEnabledSet) {
      opt.selected = true;
      firstEnabledSet = true;
    }
    select.appendChild(opt);
  });
}

async function confirmEditFromModal() {
  const id = pendingEditId;
  const appt = allUserAppointments.find((a) => a.id === id);
  if (!appt) {
    closeModal();
    return;
  }
  const dateVal = document.getElementById("editDate")?.value;
  const timeVal = document.getElementById("editTime")?.value;
  const trainerVal = document.getElementById("editTrainer")?.value;
  const serviceVal = document.getElementById("editService")?.value;
  if (!dateVal || !timeVal) {
    showModal("Pogreška", "Molimo odaberite datum i vrijeme", "error-modal");
    return;
  }
  const iso = new Date(`${dateVal}T${timeVal}:00`).toISOString();
  try {
    closeModal();
    const body = { scheduledAt: iso };
    if (trainerVal) body.trainerId = Number(trainerVal);
    if (serviceVal) body.serviceId = serviceVal;
    await put(`/api/appointments/${id}`, body);
    await loadAllAppointmentsForFiltering();
    await loadAppointments();
    updateTimeSlots();
    showModal("Uspjeh", "Termin je uspješno izmijenjen!", "success-modal");
    setTimeout(() => closeModal(), 2000);
  } catch (e) {
    showModal("Pogreška", e.message, "error-modal");
  }
}

// Trainer selection is now handled by trainer cards

document.getElementById("prevMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
  selectedDate = null;
  selectedTime = null;
  updateTimeSlots();
  updateBookButton();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
  selectedDate = null;
  selectedTime = null;
  updateTimeSlots();
  updateBookButton();
});

document.getElementById("bookBtn").addEventListener("click", async () => {
  const err = document.getElementById("bookErr");
  const success = document.getElementById("bookSuccess");
  err.textContent = "";
  success.textContent = "";

  try {
    if (
      !selectedTrainer ||
      !selectedDate ||
      !selectedTime ||
      !selectedServiceId
    ) {
      throw new Error("Molimo odaberite trenera, uslugu, datum i vrijeme");
    }

    const iso = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
    await post("/api/appointments", {
      trainerId: selectedTrainer,
      scheduledAt: iso,
      serviceId: selectedServiceId,
    });
    await loadAllAppointmentsForFiltering();
    await loadAppointments();
    updateTimeSlots();

    success.textContent = "Termin je uspješno rezerviran!";

    setTimeout(() => {
      success.textContent = "";
    }, 2000);
  } catch (e) {
    err.textContent = e.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await post("/api/logout", {});
  location.href = "/";
});

// Service selector change
document.getElementById("serviceSelect")?.addEventListener("change", (e) => {
  selectedServiceId = e.target.value;
  updateTimeSlots();
  updateBookButton();
});

// Trainer filter event listeners
document
  .getElementById("filterService")
  ?.addEventListener("change", async (e) => {
    // Note: All trainers offer all services, so no filtering needed
    filterServiceId = e.target.value || null;
    renderFilteredTrainers();
  });

document
  .getElementById("filterTrainerType")
  ?.addEventListener("change", async (e) => {
    filterTrainerType = e.target.value || null;
    await loadTrainers();
  });

// User filter event listeners
document
  .getElementById("userServiceFilter")
  ?.addEventListener("change", (e) => {
    userFilterService = e.target.value;
    renderFilteredUserAppointments();
  });

document.getElementById("userDateFilter")?.addEventListener("change", (e) => {
  userFilterDate = e.target.value;
  renderFilteredUserAppointments();
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("clearUserFiltersBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      userFilterService = "";
      userFilterDate = "";
      const serviceInput = document.getElementById("userServiceFilter");
      const dateInput = document.getElementById("userDateFilter");
      if (serviceInput) serviceInput.value = "";
      if (dateInput) dateInput.value = "";
      renderFilteredUserAppointments();
    });
  } else {
    console.error("clearUserFiltersBtn not found!");
  }
});


// Admin filter event listeners
document
  .getElementById("adminTrainerFilter")
  ?.addEventListener("change", (e) => {
    adminFilterTrainer = e.target.value;
    renderFilteredAdminAppointments();
  });

document.getElementById("adminDateFilter")?.addEventListener("change", (e) => {
  adminFilterDate = e.target.value;
  renderFilteredAdminAppointments();
});

document.getElementById("clearFiltersBtn")?.addEventListener("click", () => {
  adminFilterTrainer = "";
  adminFilterDate = "";
  document.getElementById("adminTrainerFilter").value = "";
  document.getElementById("adminDateFilter").value = "";
  renderFilteredAdminAppointments();
});

document
  .getElementById("trainerWorkHoursSelect")
  ?.addEventListener("change", async (e) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const startInput = document.getElementById("trainerWorkStartDate");
    if (startInput && !startInput.value) startInput.value = todayStr;
    await loadTrainerWorkHoursForAdmin(e.target.value);
  });

document
  .getElementById("saveTrainerWorkHoursBtn")
  ?.addEventListener("click", async () => {
    await saveTrainerWorkHours();
  });

document
  .getElementById("trainerWorkStartDate")
  ?.addEventListener("change", async (e) => {
    const trainerId = document.getElementById("trainerWorkHoursSelect")?.value;
    if (trainerId) {
      await loadTrainerWorkHoursForAdmin(trainerId);
    }
  });

// Admin reservation
document
  .getElementById("adminReserveBtn")
  ?.addEventListener("click", async () => {
    await handleAdminReservation();
  });

document
  .getElementById("adminReserveTrainerSelect")
  ?.addEventListener("change", async () => {
    await refreshAdminReserveTimes();
  });

document
  .getElementById("adminReserveServiceSelect")
  ?.addEventListener("change", async () => {
    await refreshAdminReserveTimes();
  });

document.getElementById("adminReserveDate")?.addEventListener("change", () => {
  const dateInput = document.getElementById("adminReserveDate");
  if (!dateInput) return;
  // Prevent selecting past dates via manual entry
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const minStr = `${yyyy}-${mm}-${dd}`;
  if (dateInput.value && dateInput.value < minStr) {
    dateInput.value = minStr;
  }
  refreshAdminReserveTimes();
});

document
  .getElementById("saveWorkHoursBtn")
  ?.addEventListener("click", async () => {
    const openVal = document.getElementById("workOpen")?.value;
    const closeVal = document.getElementById("workClose")?.value;
    const status = document.getElementById("workHoursStatus");
    if (status) status.textContent = "";
    if (!openVal || !closeVal) {
      if (status) status.textContent = "Unesite početak i kraj radnog vremena.";
      return;
    }
    const openHour = Number(openVal.split(":")[0]);
    const closeHour = Number(closeVal.split(":")[0]);
    try {
      await put("/api/admin/work-hours", { openHour, closeHour });
      await loadWorkHours();
      updateTimeSlots();
      if (status) status.textContent = "Radno vrijeme je spremljeno.";
    } catch (e) {
      if (status) status.textContent = e.message || "Greška pri spremanju.";
    }
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
      const pageTitle = document.getElementById("pageTitle");
      const bookingPanel = document.getElementById("bookingPanel");
      const userApptPanel = document.getElementById("userApptPanel");
      const adminPanel = document.getElementById("adminPanel");
      const adminReservePanel = document.getElementById("adminReservePanel");
      const workHoursCard = document.getElementById("workHoursCard");
      const trainerWorkHoursCard = document.getElementById(
        "trainerWorkHoursCard"
      );
      const statsPanel = document.getElementById("statsPanel");
      const userTabs = document.getElementById("userTabs");

      if (pageTitle) pageTitle.textContent = "Admin panel";
      if (bookingPanel) bookingPanel.hidden = true;
      if (userApptPanel) userApptPanel.hidden = true;
      if (adminPanel) adminPanel.hidden = false;
      if (adminReservePanel) adminReservePanel.hidden = false;
      // keep global work hours card hidden for admins
      if (workHoursCard) workHoursCard.hidden = true;
      if (trainerWorkHoursCard) trainerWorkHoursCard.hidden = false;
      if (statsPanel) statsPanel.hidden = false;
      if (userTabs) userTabs.style.display = "none";

      await loadWorkHours();
      await populateAdminTrainerFilter();
      await populateTrainerWorkHoursSelect();
      await loadTrainerWorkHoursForAdmin("");
      await populateAdminReservationSelects();
      const adminDateInput = document.getElementById("adminReserveDate");
      if (adminDateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        adminDateInput.value = `${yyyy}-${mm}-${dd}`;
        adminDateInput.min = `${yyyy}-${mm}-${dd}`;
      }
      await refreshAdminReserveTimes();
      await loadAdminAppointments();
      await loadAdminStatistics();
      console.log("Admin panel loaded");
    } else {
      console.log("Loading user panel...");
      // Make sure user panels are visible
      const bookingPanelUser = document.getElementById("bookingPanel");
      const userApptPanelUser = document.getElementById("userApptPanel");
      if (bookingPanelUser) bookingPanelUser.hidden = false;
      if (userApptPanelUser) userApptPanelUser.hidden = false;

      document.getElementById("userTabs").style.display = "flex";
      await loadWorkHours();
      services = await get("/api/services");
      const serviceSelect = document.getElementById("serviceSelect");
      serviceSelect.innerHTML = "";
      services.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.duration} min)`;
        serviceSelect.appendChild(opt);
      });

      // Populate filter service dropdown if it exists
      const filterService = document.getElementById("filterService");
      if (filterService) {
        filterService.innerHTML = '<option value="">Sve usluge</option>';
        services.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.name;
          filterService.appendChild(opt);
        });
      }

      // Populate trainer type filter dropdown
      const filterTrainerType = document.getElementById("filterTrainerType");
      if (filterTrainerType) {
        const trainerTypes = await get("/api/trainer-types");
        filterTrainerType.innerHTML = '<option value="">Svi tipovi</option>';
        trainerTypes.forEach((trainer_type) => {
          const opt = document.createElement("option");
          opt.value = trainer_type;
          opt.textContent = trainer_type;
          filterTrainerType.appendChild(opt);
        });
      }

      // Populate user service filter dropdown
      const userServiceFilter = document.getElementById("userServiceFilter");
      if (userServiceFilter) {
        userServiceFilter.innerHTML = '<option value="">Sve usluge</option>';
        services.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.name;
          opt.textContent = s.name;
          userServiceFilter.appendChild(opt);
        });
      }

      await loadAllAppointmentsForFiltering();
      console.log("All appointments loaded");
      await loadTrainers();
      console.log("Trainers loaded");
      await loadAppointments();
      console.log("User appointments loaded");
      updateTimeSlots();
    }
  } catch (e) {
    console.error("Init error:", e);
    alert("Error loading data: " + (e.message || e));
  }
})();
