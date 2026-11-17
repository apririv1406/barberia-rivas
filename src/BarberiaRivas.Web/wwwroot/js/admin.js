const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const loginFeedback = document.querySelector("#login-feedback");
const adminApp = document.querySelector("#admin-app");
const calendarDays = document.querySelector("#calendar-days");
const monthLabel = document.querySelector("#month-label");
const selectedDayLabel = document.querySelector("#selected-day-label");
const dayAppointments = document.querySelector("#day-appointments");
const pendingList = document.querySelector("#pending-list");
const dialog = document.querySelector("#appointment-dialog");
const appointmentForm = document.querySelector("#appointment-form");
const appointmentFeedback = document.querySelector("#appointment-feedback");
const adminService = document.querySelector("#admin-service");
const adminDate = document.querySelector("#admin-date");
const adminTime = document.querySelector("#admin-time");

let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = dateKey(new Date());
let monthAppointments = [];
let pendingAppointments = [];
let services = [];

function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function dateFromKey(value) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function localDateTime(date, time) {
    return date + "T" + time + ":00";
}

function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
}

async function api(url, options) {
    const settings = options || {};
    settings.credentials = "same-origin";
    settings.headers = Object.assign({}, settings.headers || {}, { "X-Requested-With": "fetch" });
    if (settings.body && !settings.headers["Content-Type"]) settings.headers["Content-Type"] = "application/json";
    const response = await fetch(url, settings);
    if (response.status === 401) {
        showLogin();
        throw new Error("Tu sesión ha caducado. Vuelve a iniciar sesión.");
    }
    const result = response.status === 204 ? null : await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.message || result.title || "No se ha podido completar la operación.");
    return result;
}

function showLogin() {
    adminApp.hidden = true;
    loginScreen.hidden = false;
}

function showAdmin() {
    loginScreen.hidden = true;
    adminApp.hidden = false;
    refreshAll();
}

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginFeedback.textContent = "";
    const data = new FormData(loginForm);
    const button = loginForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await api("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({ password: data.get("password"), remember: data.get("remember") === "on" })
        });
        loginForm.reset();
        showAdmin();
    } catch (error) {
        loginFeedback.textContent = error.message === "Unauthorized" ? "La contraseña no es correcta." : error.message;
        if (error.message === "Failed to fetch") loginFeedback.textContent = "No se ha podido conectar con el servidor.";
    } finally {
        button.disabled = false;
    }
});

document.querySelector("#logout-button").addEventListener("click", async function () {
    try { await api("/api/admin/logout", { method: "POST" }); } catch (error) { }
    showLogin();
});

document.querySelector("#prev-month").addEventListener("click", function () {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    loadMonth();
});
document.querySelector("#next-month").addEventListener("click", function () {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    loadMonth();
});
document.querySelector("#go-today").addEventListener("click", function () {
    visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selectedDate = dateKey(new Date());
    loadMonth();
});
document.querySelector("#new-appointment").addEventListener("click", openDialog);
document.querySelector("#close-dialog").addEventListener("click", closeDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeDialog();
});

async function refreshAll() {
    try {
        await loadServices();
        await Promise.all([loadMonth(), loadPending(), loadSummary()]);
    } catch (error) {
        if (error.message) console.error(error);
    }
}

async function loadServices() {
    const response = await fetch("/api/services");
    if (!response.ok) throw new Error("No se han podido cargar los servicios.");
    services = await response.json();
    adminService.innerHTML = '<option value="">Selecciona un servicio</option>';
    services.forEach(function (service) {
        const option = document.createElement("option");
        option.value = service.id;
        option.textContent = service.name + (service.durationMinutes ? " · " + service.durationMinutes + " min" : "");
        adminService.append(option);
    });
}

async function loadMonth() {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const url = "/api/admin/appointments?from=" + encodeURIComponent(localDateTime(dateKey(from), "00:00")) +
        "&to=" + encodeURIComponent(localDateTime(dateKey(to), "00:00"));
    monthAppointments = await api(url);
    monthLabel.textContent = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(visibleMonth);
    monthLabel.textContent = monthLabel.textContent.charAt(0).toUpperCase() + monthLabel.textContent.slice(1);
    renderCalendar();
    renderDay();
}

function renderCalendar() {
    calendarDays.innerHTML = "";
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = dateKey(new Date());
    const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

    for (let index = 0; index < totalCells; index++) {
        const dayNumber = index - offset + 1;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "calendar-day";
        if (dayNumber < 1 || dayNumber > daysInMonth) {
            cell.classList.add("outside");
            cell.disabled = true;
            cell.innerHTML = "<span></span>";
        } else {
            const key = dateKey(new Date(year, month, dayNumber));
            const items = monthAppointments.filter(function (item) {
                return item.requestedAt.slice(0, 10) === key &&
                    (item.status === "Pendiente" || item.status === "Confirmada");
            });
            cell.classList.toggle("selected", key === selectedDate);
            cell.classList.toggle("is-today", key === today);
            const number = document.createElement("span");
            number.className = "day-number";
            number.textContent = dayNumber;
            cell.append(number);
            if (items.length) {
                const markers = document.createElement("span");
                markers.className = "day-markers";
                const pending = items.filter(function (item) { return item.status === "Pendiente"; }).length;
                const confirmed = items.length - pending;
                if (pending) markers.innerHTML += '<i class="dot pending-dot"></i>';
                if (confirmed) markers.innerHTML += '<i class="dot confirmed-dot"></i>';
                const count = document.createElement("small");
                count.textContent = items.length + (items.length === 1 ? " cita" : " citas");
                cell.append(markers, count);
            } else {
                const empty = document.createElement("small");
                empty.textContent = "—";
                cell.append(empty);
            }
            cell.addEventListener("click", function () {
                selectedDate = key;
                renderCalendar();
                renderDay();
            });
        }
        calendarDays.append(cell);
    }
}

function renderDay() {
    const date = dateFromKey(selectedDate);
    selectedDayLabel.textContent = new Intl.DateTimeFormat("es-ES", {
        weekday: "long", day: "numeric", month: "long"
    }).format(date);
    const items = monthAppointments.filter(function (item) {
        return item.requestedAt.slice(0, 10) === selectedDate &&
            item.status !== "Rechazada" && item.status !== "Cancelada";
    }).sort(function (a, b) { return a.requestedAt.localeCompare(b.requestedAt); });
    document.querySelector("#day-count").textContent = items.length + (items.length === 1 ? " cita" : " citas");
    if (!items.length) {
        dayAppointments.innerHTML = '<p class="empty-state">No hay citas para este día.</p>';
        return;
    }
    dayAppointments.innerHTML = "";
    items.forEach(function (item) { dayAppointments.append(createAppointmentCard(item, true)); });
}

function createAppointmentCard(item, compact) {
    const card = document.createElement("article");
    card.className = "appointment-card " + (item.status === "Pendiente" ? "is-pending" : "is-confirmed");
    const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.requestedAt));
    const actions = [];
    if (item.status === "Pendiente") {
        actions.push('<button class="action-button accept" data-action="Confirmada">Confirmar</button>');
        actions.push('<button class="action-button reject" data-action="Rechazada">Rechazar</button>');
    } else if (item.status === "Confirmada") {
        actions.push('<button class="action-button reject" data-action="Cancelada">Cancelar cita</button>');
    }
    card.innerHTML =
        '<div class="appointment-time">' + time + '</div>' +
        '<div class="appointment-info"><strong>' + escapeText(item.customerName) + '</strong>' +
        '<span>' + escapeText(item.serviceName) + ' · ' + escapeText(item.phone) + '</span>' +
        (item.notes ? '<small>' + escapeText(item.notes) + '</small>' : '') +
        '<span class="status-pill ' + (item.status === "Pendiente" ? "status-pending" : "status-confirmed") + '">' + escapeText(item.status) + '</span></div>' +
        '<div class="appointment-actions">' + actions.join("") + '</div>';
    card.querySelectorAll("[data-action]").forEach(function (button) {
        button.addEventListener("click", function () {
            updateStatus(item.id, button.dataset.action);
        });
    });
    return card;
}

async function loadPending() {
    pendingAppointments = await api("/api/admin/appointments?status=Pendiente");
    pendingAppointments.sort(function (a, b) { return a.requestedAt.localeCompare(b.requestedAt); });
    renderPending();
}

function renderPending() {
    const count = pendingAppointments.length;
    document.querySelector("#pending-nav-count").textContent = count;
    document.querySelector("#pending-count-label").textContent = count + (count === 1 ? " solicitud" : " solicitudes");
    if (!count) {
        pendingList.innerHTML = '<p class="empty-state">No hay solicitudes pendientes. ¡Todo al día!</p>';
        return;
    }
    pendingList.innerHTML = "";
    pendingAppointments.forEach(function (item) {
        const card = createAppointmentCard(item, false);
        const date = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(item.requestedAt));
        card.querySelector(".appointment-time").textContent = date + " · " +
            new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.requestedAt));
        pendingList.append(card);
    });
}

async function loadSummary() {
    const summary = await api("/api/admin/summary");
    document.querySelector("#stat-pending").textContent = summary.pending;
    document.querySelector("#stat-today").textContent = summary.today;
    document.querySelector("#stat-confirmed").textContent = summary.confirmedToday;
}

async function updateStatus(id, status) {
    const messages = {
        Confirmada: "¿Quieres confirmar esta cita?",
        Rechazada: "¿Quieres rechazar esta solicitud?",
        Cancelada: "¿Quieres cancelar esta cita?"
    };
    if (!window.confirm(messages[status])) return;
    try {
        await api("/api/admin/appointments/" + id + "/status", {
            method: "PATCH", body: JSON.stringify({ status: status })
        });
        await Promise.all([loadMonth(), loadPending(), loadSummary()]);
    } catch (error) {
        window.alert(error.message);
    }
}

function configureTimeOptions() {
    adminTime.innerHTML = "";
    [[10, 0, 14, 0], [16, 0, 20, 0]].forEach(function (period) {
        let minutes = period[0] * 60;
        const end = period[2] * 60;
        while (minutes < end) {
            const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
            const mins = String(minutes % 60).padStart(2, "0");
            const value = hours + ":" + mins;
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            adminTime.append(option);
            minutes += 30;
        }
    });
}

function openDialog() {
    appointmentForm.reset();
    appointmentFeedback.textContent = "";
    adminDate.min = dateKey(new Date());
    adminDate.value = selectedDate;
    dialog.showModal();
}

function closeDialog() {
    dialog.close();
}

appointmentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    appointmentFeedback.textContent = "";
    const data = new FormData(appointmentForm);
    const payload = {
        serviceId: data.get("serviceId"),
        name: data.get("name"),
        phone: data.get("phone"),
        email: data.get("email"),
        notes: data.get("notes"),
        requestedAt: localDateTime(data.get("date"), data.get("time")),
        confirm: data.get("confirm") === "on"
    };
    const button = appointmentForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await api("/api/admin/appointments", { method: "POST", body: JSON.stringify(payload) });
        closeDialog();
        selectedDate = data.get("date");
        visibleMonth = new Date(dateFromKey(selectedDate).getFullYear(), dateFromKey(selectedDate).getMonth(), 1);
        await Promise.all([loadMonth(), loadPending(), loadSummary()]);
    } catch (error) {
        appointmentFeedback.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

configureTimeOptions();
adminDate.min = dateKey(new Date());
api("/api/admin/me").then(showAdmin).catch(showLogin);
