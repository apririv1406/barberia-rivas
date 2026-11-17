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
const serviceDialog = document.querySelector("#service-dialog");
const serviceForm = document.querySelector("#service-form");
const serviceFeedback = document.querySelector("#service-feedback");
const serviceAdminList = document.querySelector("#service-admin-list");
const agendaView = document.querySelector("#agenda-view");
const servicesView = document.querySelector("#services-view");
const availabilityView = document.querySelector("#availability-view");
const customersView = document.querySelector("#customers-view");
const waitlistView = document.querySelector("#waitlist-view");
const businessHoursEditor = document.querySelector("#business-hours-editor");
const availabilityBlockList = document.querySelector("#availability-block-list");
const blockForm = document.querySelector("#block-form");

let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarView = "week";
let selectedDate = dateKey(new Date());
let monthAppointments = [];
let pendingAppointments = [];
let services = [];
let businessHours = [];

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

function showToast(message) {
    const toast = document.querySelector("#admin-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove("is-visible"); }, 5000);
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
    if (calendarView === "week") {
        const date = dateFromKey(selectedDate);
        date.setDate(date.getDate() - 7);
        selectedDate = dateKey(date);
    } else {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    }
    loadCalendar();
});
document.querySelector("#next-month").addEventListener("click", function () {
    if (calendarView === "week") {
        const date = dateFromKey(selectedDate);
        date.setDate(date.getDate() + 7);
        selectedDate = dateKey(date);
    } else {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    }
    loadCalendar();
});
document.querySelector("#go-today").addEventListener("click", function () {
    selectedDate = dateKey(new Date());
    visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    loadCalendar();
});
document.querySelector("#view-week").addEventListener("click", function () {
    calendarView = "week";
    document.querySelector("#view-week").classList.add("active");
    document.querySelector("#view-week").setAttribute("aria-pressed", "true");
    document.querySelector("#view-month").classList.remove("active");
    document.querySelector("#view-month").setAttribute("aria-pressed", "false");
    loadCalendar();
});
document.querySelector("#view-month").addEventListener("click", function () {
    calendarView = "month";
    visibleMonth = new Date(dateFromKey(selectedDate).getFullYear(), dateFromKey(selectedDate).getMonth(), 1);
    document.querySelector("#view-month").classList.add("active");
    document.querySelector("#view-month").setAttribute("aria-pressed", "true");
    document.querySelector("#view-week").classList.remove("active");
    document.querySelector("#view-week").setAttribute("aria-pressed", "false");
    loadCalendar();
});
document.querySelector("#new-appointment").addEventListener("click", openDialog);
document.querySelector("#new-service").addEventListener("click", function () { openServiceDialog(null); });
document.querySelector("#save-business-hours").addEventListener("click", saveBusinessHours);
document.querySelector("#block-kind").addEventListener("change", updateBlockFormFields);
blockForm.addEventListener("submit", saveAvailabilityBlock);
document.querySelector("#close-service-dialog").addEventListener("click", closeServiceDialog);
document.querySelector("#cancel-service-dialog").addEventListener("click", closeServiceDialog);
serviceDialog.addEventListener("click", function (event) { if (event.target === serviceDialog) closeServiceDialog(); });

function closeMobileMenu() {
    document.querySelector("#admin-sidebar").classList.remove("is-open");
    adminApp.classList.remove("menu-open");
    document.querySelector("#mobile-menu-toggle").setAttribute("aria-expanded", "false");
    document.querySelector("#mobile-menu-toggle").setAttribute("aria-label", "Abrir menú");
}
document.querySelector("#mobile-menu-toggle").addEventListener("click", function () {
    const sidebar = document.querySelector("#admin-sidebar");
    const opening = !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", opening);
    adminApp.classList.toggle("menu-open", opening);
    this.setAttribute("aria-expanded", String(opening));
    this.setAttribute("aria-label", opening ? "Cerrar menú" : "Abrir menú");
});
document.querySelector("#sidebar-close").addEventListener("click", closeMobileMenu);
adminApp.addEventListener("click", function (event) {
    if (adminApp.classList.contains("menu-open") && event.target === adminApp) closeMobileMenu();
});

document.querySelectorAll(".side-nav [data-view]").forEach(function (link) {
    link.addEventListener("click", function (event) {
        event.preventDefault();
        closeMobileMenu();
        const view = link.dataset.view;
        document.querySelectorAll(".side-nav [data-view]").forEach(function (item) { item.classList.toggle("active", item === link); });
        agendaView.hidden = !["agenda", "pending"].includes(view);
        servicesView.hidden = view !== "services";
        availabilityView.hidden = view !== "availability";
        customersView.hidden = view !== "customers";
        waitlistView.hidden = view !== "waitlist";
        document.querySelector("#new-appointment").hidden = !["agenda", "pending"].includes(view);
        document.querySelector(".topbar h1").textContent = ({ services: "Servicios", availability: "Horarios y cierres", customers: "Clientes", waitlist: "Lista de espera" })[view] || "Agenda";
        if (view === "services") {
            loadAdminServices();
            servicesView.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (view === "availability") {
            loadAdminAvailability();
            availabilityView.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (view === "customers") {
            loadCustomers();
            customersView.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (view === "waitlist") {
            loadWaitlist();
            waitlistView.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (view === "pending") {
            document.querySelector("#pendientes").scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            agendaView.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
});
document.querySelector("#close-dialog").addEventListener("click", closeDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeDialog();
});

async function loadAdminServices() {
    try {
        const items = await api("/api/admin/services");
        serviceAdminList.innerHTML = "";
        if (!items.length) {
            serviceAdminList.innerHTML = '<p class="empty-state">Todavía no hay servicios. Añade el primero.</p>';
            return;
        }
        items.forEach(function (service) {
            const card = document.createElement("article");
            card.className = "service-admin-card" + (service.isActive ? "" : " is-inactive");
            const price = service.price === null ? "Precio sin indicar" : Number(service.price).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
            const duration = service.durationMinutes ? service.durationMinutes + " min" : "Duración sin indicar";
            card.innerHTML =
                '<div class="service-admin-main"><div><strong>' + escapeText(service.name) + '</strong>' +
                '<p>' + escapeText(service.description || "Sin descripción") + '</p></div>' +
                '<span class="service-state ' + (service.isActive ? "active" : "inactive") + '">' + (service.isActive ? "Visible en la web" : "Desactivado") + '</span></div>' +
                '<div class="service-admin-meta"><span>' + escapeText(price) + '</span><span>' + escapeText(duration) + '</span><span>Orden: ' + escapeText(service.displayOrder) + '</span></div>' +
                '<div class="service-admin-actions"><button type="button" class="secondary-button edit-service">Editar</button>' +
                '<button type="button" class="secondary-button toggle-service">' + (service.isActive ? "Desactivar" : "Activar") + '</button></div>';
            card.querySelector(".edit-service").addEventListener("click", function () { openServiceDialog(service); });
            card.querySelector(".toggle-service").addEventListener("click", function () { toggleService(service); });
            serviceAdminList.append(card);
        });
    } catch (error) {
        serviceAdminList.innerHTML = '<p class="empty-state">' + escapeText(error.message) + '</p>';
    }
}

function openServiceDialog(service) {
    serviceForm.reset();
    serviceFeedback.textContent = "";
    serviceForm.elements.id.value = service ? service.id : "";
    serviceForm.elements.name.value = service ? service.name : "";
    serviceForm.elements.description.value = service ? (service.description || "") : "";
    serviceForm.elements.price.value = service && service.price !== null ? service.price : "";
    serviceForm.elements.durationMinutes.value = service && service.durationMinutes !== null ? service.durationMinutes : "";
    serviceForm.elements.displayOrder.value = service ? service.displayOrder : (services.length + 1);
    document.querySelector("#service-dialog-title").textContent = service ? "Editar servicio" : "Añadir servicio";
    serviceDialog.showModal();
}

function closeServiceDialog() { serviceDialog.close(); }

const weekdayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function renderBusinessHours(hours) {
    businessHoursEditor.innerHTML = "";
    weekdayNames.forEach(function (name, weekday) {
        const dayRows = hours.filter(function (item) { return Number(item.weekday) === weekday; });
        const day = document.createElement("div");
        day.className = "business-hours-day";
        const heading = document.createElement("strong");
        heading.textContent = name;
        const periods = document.createElement("div");
        periods.className = "business-hours-periods";
        [1, 2].forEach(function (period) {
            const current = dayRows.find(function (item) { return Number(item.period) === period; });
            const row = document.createElement("div");
            row.className = "business-hours-period";
            const label = document.createElement("span");
            label.textContent = period === 1 ? "Turno 1" : "Turno 2";
            const start = document.createElement("input");
            start.type = "time";
            start.className = "hours-start";
            start.value = current ? current.startTime : "";
            start.setAttribute("aria-label", name + " " + label.textContent + " desde");
            const separator = document.createElement("span");
            separator.textContent = "a";
            const end = document.createElement("input");
            end.type = "time";
            end.className = "hours-end";
            end.value = current ? current.endTime : "";
            end.setAttribute("aria-label", name + " " + label.textContent + " hasta");
            row.append(label, start, separator, end);
            periods.append(row);
        });
        day.append(heading, periods);
        day.dataset.weekday = String(weekday);
        businessHoursEditor.append(day);
    });
}

async function loadAdminAvailability() {
    try {
        const result = await api("/api/admin/availability");
        businessHours = result.hours || [];
        renderBusinessHours(businessHours);
        configureTimeOptions();
        renderAvailabilityBlocks(result.blocks || []);
    } catch (error) {
        businessHoursEditor.innerHTML = '<p class="empty-state">' + escapeText(error.message) + '</p>';
    }
}

async function saveBusinessHours() {
    const rows = [];
    businessHoursEditor.querySelectorAll(".business-hours-day").forEach(function (day) {
        const weekday = Number(day.dataset.weekday);
        day.querySelectorAll(".business-hours-period").forEach(function (period, index) {
            const startTime = period.querySelector(".hours-start").value;
            const endTime = period.querySelector(".hours-end").value;
            if (startTime && endTime) rows.push({ weekday: weekday, period: index + 1, startTime: startTime, endTime: endTime });
        });
    });
    const button = document.querySelector("#save-business-hours");
    button.disabled = true;
    try {
        await api("/api/admin/availability/hours", { method: "PUT", body: JSON.stringify({ hours: rows }) });
        showToast("Horario de atención guardado.");
        await loadAdminAvailability();
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
}

function updateBlockFormFields() {
    const personal = document.querySelector("#block-kind").value === "personal";
    document.querySelector("#personal-time-fields").hidden = !personal;
    document.querySelector("#block-end-date").closest("label").hidden = personal;
    document.querySelector("#block-end-date").required = !personal;
    document.querySelector("#block-start-time").required = personal;
    document.querySelector("#block-end-time").required = personal;
}

function addDaysToKey(value, days) {
    const date = dateFromKey(value);
    date.setDate(date.getDate() + days);
    return dateKey(date);
}

async function saveAvailabilityBlock(event) {
    event.preventDefault();
    const data = new FormData(blockForm);
    const kind = data.get("kind");
    const startDate = data.get("startDate");
    const endDate = kind === "vacaciones" ? addDaysToKey(data.get("endDate"), 1) : startDate;
    const startAt = startDate + "T" + (kind === "vacaciones" ? "00:00" : data.get("startTime"));
    const endAt = endDate + "T" + (kind === "vacaciones" ? "00:00" : data.get("endTime"));
    const feedback = document.querySelector("#block-feedback");
    feedback.textContent = "";
    const button = blockForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await api("/api/admin/availability/blocks", {
            method: "POST",
            body: JSON.stringify({ kind: kind, startAt: startAt, endAt: endAt, label: data.get("label") })
        });
        blockForm.reset();
        document.querySelector("#block-start-time").value = "10:00";
        document.querySelector("#block-end-time").value = "11:00";
        updateBlockFormFields();
        showToast(kind === "vacaciones" ? "Periodo de vacaciones guardado." : "Reserva personal guardada.");
        await loadAdminAvailability();
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
}

function renderAvailabilityBlocks(blocks) {
    availabilityBlockList.innerHTML = "";
    if (!blocks.length) {
        availabilityBlockList.innerHTML = '<p class="empty-state">No hay vacaciones ni reservas personales.</p>';
        return;
    }
    blocks.forEach(function (item) {
        const row = document.createElement("div");
        row.className = "availability-block-item";
        const start = item.startAt.replace(" ", "T");
        const end = item.endAt.replace(" ", "T");
        const startDate = start.slice(0, 10);
        const endDate = end.slice(0, 10);
        const isVacation = item.kind === "vacaciones";
        let range = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(dateFromKey(startDate));
        if (isVacation) {
            const inclusiveEnd = addDaysToKey(endDate, -1);
            range += " – " + new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(dateFromKey(inclusiveEnd));
        } else {
            range += " · " + start.slice(11, 16) + "–" + end.slice(11, 16);
        }
        row.innerHTML = '<div><strong>' + escapeText(item.label) + '</strong><span>' +
            (isVacation ? "Vacaciones / cierre" : "Reserva personal") + ' · ' + escapeText(range) +
            '</span></div><button type="button" class="secondary-button remove-block">Eliminar</button>';
        row.querySelector(".remove-block").addEventListener("click", async function () {
            if (!window.confirm("¿Eliminar este bloqueo? El horario volverá a estar disponible.")) return;
            try {
                await api("/api/admin/availability/blocks/" + item.id, { method: "DELETE" });
                await loadAdminAvailability();
                showToast("Bloqueo eliminado.");
            } catch (error) { showToast(error.message); }
        });
        availabilityBlockList.append(row);
    });
}

async function toggleService(service) {
    const action = service.isActive ? "desactivar" : "activar";
    if (!window.confirm("¿Quieres " + action + " «" + service.name + "»?")) return;
    try {
        await api("/api/admin/services/" + service.id, {
            method: "PATCH", body: JSON.stringify({ isActive: !service.isActive })
        });
        await Promise.all([loadAdminServices(), loadServices()]);
    } catch (error) { showToast(error.message); }
}

serviceForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    serviceFeedback.textContent = "";
    const data = new FormData(serviceForm);
    const payload = {
        name: data.get("name"),
        description: data.get("description"),
        price: data.get("price") === "" ? null : Number(data.get("price")),
        durationMinutes: data.get("durationMinutes") === "" ? null : Number(data.get("durationMinutes")),
        displayOrder: Number(data.get("displayOrder") || 0)
    };
    const id = data.get("id");
    const button = serviceForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await api(id ? "/api/admin/services/" + id : "/api/admin/services", {
            method: id ? "PATCH" : "POST", body: JSON.stringify(payload)
        });
        closeServiceDialog();
        await Promise.all([loadAdminServices(), loadServices()]);
    } catch (error) {
        serviceFeedback.textContent = error.message;
    } finally { button.disabled = false; }
});

async function refreshAll() {
    try {
        await loadServices();
        await Promise.all([loadCalendar(), loadPending(), loadSummary(), loadAdminAvailability()]);
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

async function loadCalendar() {
    if (calendarView === "week") return loadWeek();
    return loadMonth();
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
    document.querySelector(".workspace").classList.remove("week-mode");
    adminApp.classList.remove("week-view-active");
    document.querySelector("#month-calendar").hidden = false;
    document.querySelector("#month-day-panel").hidden = false;
    document.querySelector("#week-calendar").hidden = true;
    renderCalendar();
    renderDay();
}

async function loadWeek() {
    const anchor = dateFromKey(selectedDate);
    const monday = new Date(anchor);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const fridayAfter = new Date(monday);
    fridayAfter.setDate(fridayAfter.getDate() + 5);
    const fromKey = dateKey(monday);
    const toKey = dateKey(fridayAfter);
    const url = "/api/admin/appointments?from=" + encodeURIComponent(localDateTime(fromKey, "00:00")) +
        "&to=" + encodeURIComponent(localDateTime(toKey, "00:00"));
    monthAppointments = await api(url);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const formatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
    monthLabel.textContent = formatter.format(monday) + " – " + formatter.format(friday) +
        " " + friday.getFullYear();
    monthLabel.textContent = monthLabel.textContent.charAt(0).toUpperCase() + monthLabel.textContent.slice(1);
    document.querySelector(".workspace").classList.add("week-mode");
    adminApp.classList.add("week-view-active");
    document.querySelector("#month-calendar").hidden = true;
    document.querySelector("#month-day-panel").hidden = true;
    document.querySelector("#week-calendar").hidden = false;
    renderWeek(monday);
}

function renderWeek(monday) {
    const container = document.querySelector("#week-calendar");
    container.innerHTML = "";
    const today = dateKey(new Date());
    const weekdays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
    for (let index = 0; index < 5; index++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + index);
        const key = dateKey(date);
        const items = monthAppointments.filter(function (item) {
            return item.requestedAt.slice(0, 10) === key &&
                item.status !== "Rechazada" && item.status !== "Cancelada";
        }).sort(function (a, b) { return a.requestedAt.localeCompare(b.requestedAt); });
        const column = document.createElement("section");
        column.className = "week-day" + (key === today ? " is-today" : "");
        const heading = document.createElement("header");
        heading.className = "week-day-heading";
        heading.innerHTML = "<div><strong>" + weekdays[index] + "</strong><span>" +
            new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date) +
            "</span></div><small>" + items.length + (items.length === 1 ? " cita" : " citas") + "</small>";
        column.append(heading);
        const list = document.createElement("div");
        list.className = "week-day-appointments";
        if (!items.length) {
            list.innerHTML = '<p class="week-empty">Sin citas</p>';
        } else {
            items.forEach(function (item) { list.append(createAppointmentCard(item, true)); });
        }
        column.append(list);
        container.append(column);
    }
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
        actions.push('<button class="action-button accept" data-whatsapp="Confirmada" title="Abrir WhatsApp para confirmar" aria-label="Confirmar cita por WhatsApp">Confirmar</button>');
        actions.push('<button class="action-button reject" data-whatsapp="Rechazada" title="Abrir WhatsApp para rechazar" aria-label="Rechazar solicitud por WhatsApp">Rechazar</button>');
        actions.push('<button class="action-button" data-whatsapp="Cambiar" title="Abrir WhatsApp para proponer un cambio" aria-label="Cambiar cita por WhatsApp">Cambiar</button>');
    } else if (item.status === "Confirmada") {
        actions.push('<button class="action-button" data-whatsapp="Cambiar" title="Abrir WhatsApp para proponer un cambio" aria-label="Cambiar cita por WhatsApp">Cambiar</button>');
        actions.push('<button class="action-button reject" data-whatsapp="Cancelada" title="Abrir WhatsApp para cancelar" aria-label="Cancelar cita por WhatsApp">Cancelar</button>');
    }
    if (item.status === "Confirmada") {
        actions.push('<button class="action-button" data-result="Completada">Completada</button>');
        actions.push('<button class="action-button" data-result="No presentado">No presentado</button>');
    }
    if (item.status === "Pendiente" || item.status === "Confirmada") {
        actions.push('<button class="action-button" data-edit="true">Editar</button>');
    }
    card.innerHTML =
        '<div class="appointment-time">' + time + '</div>' +
        '<div class="appointment-info"><strong>' + escapeText(item.customerName) + '</strong>' +
        '<span>' + escapeText(item.serviceName) + ' · ' + escapeText(item.phone) + '</span>' +
        (item.notes ? '<small>' + escapeText(item.notes) + '</small>' : '') +
        '<span class="status-pill ' + (item.status === "Pendiente" ? "status-pending" : "status-confirmed") + '">' + escapeText(item.status) + '</span></div>' +
        '<div class="appointment-actions">' + actions.join("") + '</div>';
    card.querySelectorAll("[data-whatsapp]").forEach(function (button) {
        button.addEventListener("click", function () { sendWhatsAppAction(item, button.dataset.whatsapp); });
    });
    card.querySelectorAll("[data-action]").forEach(function (button) {
        button.addEventListener("click", function () {
            updateStatus(item.id, button.dataset.action);
        });
    });
    card.querySelectorAll("[data-result]").forEach(function (button) {
        button.addEventListener("click", function () { updateAppointmentResult(item.id, button.dataset.result); });
    });
    card.querySelectorAll("[data-edit]").forEach(function (button) {
        button.addEventListener("click", function () { openEditDialog(item); });
    });
    return card;
}

function sendWhatsAppAction(item, action) {
    const digits = String(item.phone || "").replace(/\D/g, "");
    const phone = digits.startsWith("00") ? digits.slice(2) : (digits.startsWith("34") ? digits : "34" + digits);
    if (!phone || phone.length < 9) {
        showToast("Este cliente no tiene un teléfono válido para WhatsApp.");
        return;
    }
    const appointmentDate = new Date(item.requestedAt);
    const date = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(appointmentDate);
    const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(appointmentDate);
    const messages = {
        Confirmada: "Hola " + item.customerName + ", tu cita en Barbería Rivas para el " + date + " a las " + time + " ha quedado confirmada. ¡Te esperamos!",
        Rechazada: "Hola " + item.customerName + ", sentimos comunicarte que no podemos atender tu solicitud de cita del " + date + " a las " + time + ". Disculpa las molestias.",
        Cambiar: "Hola " + item.customerName + ", necesitamos cambiar tu cita en Barbería Rivas prevista para el " + date + " a las " + time + ". ¿Qué otra fecha u hora te vendría bien?",
        Cancelada: "Hola " + item.customerName + ", te confirmamos que tu cita en Barbería Rivas del " + date + " a las " + time + " ha sido cancelada."
    };
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(messages[action]), "_blank", "noopener");
    if (action !== "Cambiar") updateStatus(item.id, action, true);
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

async function updateAppointmentResult(id, outcome) {
    const question = outcome === "Completada" ? "¿Marcar esta cita como completada?" : "¿Marcar al cliente como no presentado?";
    if (!window.confirm(question)) return;
    try {
        await api("/api/admin/appointments/" + id + "/result", { method: "PATCH", body: JSON.stringify({ outcome: outcome }) });
        await Promise.all([loadCalendar(), loadPending(), loadSummary()]);
        showToast("Resultado de la cita actualizado.");
    } catch (error) { showToast(error.message); }
}

async function updateStatus(id, status, skipConfirm) {
    const messages = {
        Confirmada: "¿Quieres confirmar esta cita?",
        Rechazada: "¿Quieres rechazar esta solicitud?",
        Cancelada: "¿Quieres cancelar esta cita?"
    };
    if (!skipConfirm && !window.confirm(messages[status])) return;
    try {
        await api("/api/admin/appointments/" + id + "/status", {
            method: "PATCH", body: JSON.stringify({ status: status })
        });
        await Promise.all([loadCalendar(), loadPending(), loadSummary()]);
    } catch (error) {
        showToast(error.message);
    }
}

function configureTimeOptions() {
    if (!adminTime) return;
    adminTime.innerHTML = "";
    const date = adminDate && adminDate.value ? dateFromKey(adminDate.value) : new Date();
    const weekday = date.getDay();
    const periods = businessHours.filter(function (item) { return Number(item.weekday) === weekday; })
        .sort(function (a, b) { return Number(a.period) - Number(b.period); });
    periods.forEach(function (period) {
        let minutes = Number(period.startTime.slice(0, 2)) * 60 + Number(period.startTime.slice(3, 5));
        const end = Number(period.endTime.slice(0, 2)) * 60 + Number(period.endTime.slice(3, 5));
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
    if (!periods.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Día cerrado";
        adminTime.append(option);
    }
}

function openDialog() {
    appointmentForm.reset();
    appointmentForm.elements.appointmentId.value = "";
    document.querySelector("#appointment-dialog-title").textContent = "Nueva cita";
    appointmentFeedback.textContent = "";
    adminDate.min = dateKey(new Date());
    adminDate.value = selectedDate;
    configureTimeOptions();
    dialog.showModal();
}
function openEditDialog(item) {
    appointmentForm.reset();
    appointmentForm.elements.appointmentId.value = item.id;
    document.querySelector("#appointment-dialog-title").textContent = "Editar cita";
    appointmentFeedback.textContent = "";
    adminDate.min = dateKey(new Date());
    adminDate.value = item.requestedAt.slice(0, 10);
    configureTimeOptions();
    adminService.value = item.serviceId;
    appointmentForm.elements.name.value = item.customerName;
    appointmentForm.elements.phone.value = item.phone;
    appointmentForm.elements.email.value = item.email || "";
    appointmentForm.elements.notes.value = item.notes || "";
    if (appointmentForm.elements.internalNotes) appointmentForm.elements.internalNotes.value = item.internalNotes || "";
    adminTime.value = item.requestedAt.slice(11, 16);
    appointmentForm.elements.confirm.checked = item.status === "Confirmada";
    dialog.showModal();
}

function closeDialog() {
    dialog.close();
}

appointmentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    appointmentFeedback.textContent = "";
    const data = new FormData(appointmentForm);
    const appointmentId = data.get("appointmentId");
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
        await api(appointmentId ? "/api/admin/appointments/" + appointmentId : "/api/admin/appointments", { method: appointmentId ? "PATCH" : "POST", body: JSON.stringify(payload) });
        closeDialog();
        selectedDate = data.get("date");
        visibleMonth = new Date(dateFromKey(selectedDate).getFullYear(), dateFromKey(selectedDate).getMonth(), 1);
        await Promise.all([loadCalendar(), loadPending(), loadSummary()]);
    } catch (error) {
        appointmentFeedback.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});


async function loadCustomers() {
    const query = document.querySelector("#customer-search").value.trim();
    try {
        const items = await api("/api/admin/customers?q=" + encodeURIComponent(query));
        const list = document.querySelector("#customer-list"); list.innerHTML = "";
        if (!items.length) { list.innerHTML = '<p class="empty-state">No hay clientes registrados todavía.</p>'; return; }
        items.forEach(function (item) {
            const card = document.createElement("article"); card.className = "customer-card";
            const last = item.lastAppointment ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(item.lastAppointment)) : "Sin citas";
            card.innerHTML = '<div><strong>' + escapeText(item.name) + '</strong><span>' + escapeText(item.phone) + '</span><small>' + Number(item.appointmentCount) + ' citas · Última visita: ' + last + '</small></div><div class="customer-card-actions"><button class="secondary-button" type="button">Historial</button><button class="secondary-button" type="button">Editar</button></div>';
            card.querySelectorAll("button")[0].addEventListener("click", async function () {
                try {
                    const detail = await api("/api/admin/customers/" + item.id);
                    const history = document.querySelector("#customer-history");
                    history.hidden = false;
                    history.innerHTML = '<h3>Historial de ' + escapeText(detail.customer.name) + '</h3>' +
                        (detail.appointments.length ? detail.appointments.map(function (appointment) {
                            const when = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.requestedAt));
                            return '<article><strong>' + escapeText(appointment.serviceName) + '</strong><span>' + when + ' · ' + escapeText(appointment.status) + (appointment.outcome && appointment.outcome !== "Pendiente" ? ' · ' + escapeText(appointment.outcome) : '') + '</span></article>';
                        }).join("") : '<p class="empty-state">Este cliente todavía no tiene citas.</p>');
                } catch (error) { showToast(error.message); }
            });
            card.querySelectorAll("button")[1].addEventListener("click", function () {
                const form = document.querySelector("#customer-form"); form.hidden = false;
                form.elements.id.value = item.id; form.elements.name.value = item.name; form.elements.phone.value = item.phone;
                form.elements.email.value = item.email || ""; form.elements.notes.value = item.notes || "";
                form.scrollIntoView({ behavior: "smooth", block: "center" });
            }); list.append(card);
        });
    } catch (error) { showToast(error.message); }
}
document.querySelector("#customer-search").addEventListener("input", function () { clearTimeout(loadCustomers.timer); loadCustomers.timer = setTimeout(loadCustomers, 250); });
document.querySelector("#new-customer").addEventListener("click", function () { const form = document.querySelector("#customer-form"); form.reset(); form.elements.id.value = ""; form.hidden = false; form.scrollIntoView({ behavior: "smooth", block: "center" }); });
document.querySelector("#cancel-customer").addEventListener("click", function () { document.querySelector("#customer-form").hidden = true; });
document.querySelector("#customer-form").addEventListener("submit", async function (event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), id = data.get("id");
    const payload = { name: data.get("name"), phone: data.get("phone"), email: data.get("email"), notes: data.get("notes") };
    try { await api(id ? "/api/admin/customers/" + id : "/api/admin/customers", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) }); form.hidden = true; form.reset(); await loadCustomers(); showToast("Cliente guardado correctamente."); }
    catch (error) { document.querySelector("#customer-feedback").textContent = error.message; }
});
async function loadWaitlist() {
    try {
        const items = await api("/api/admin/waitlist"), list = document.querySelector("#waitlist-list"); list.innerHTML = "";
        if (!items.length) { list.innerHTML = '<p class="empty-state">La lista de espera está vacía.</p>'; return; }
        items.forEach(function (item) {
            const card = document.createElement("article"); card.className = "waitlist-card";
            card.innerHTML = '<div><strong>' + escapeText(item.customerName) + '</strong><span>' + escapeText(item.phone) + ' · ' + escapeText(item.serviceName || "Cualquier servicio") + '</span><small>' + escapeText(item.preferredDate || "Sin fecha") + ' · ' + escapeText(item.preferredTime || "Indiferente") + '</small></div><div class="waitlist-actions"><button class="secondary-button" type="button">WhatsApp</button><button class="secondary-button" type="button">Resuelto</button></div>';
            card.querySelectorAll("button")[0].addEventListener("click", function () {
                const digits = String(item.phone).replace(/\D/g, ""), phone = digits.startsWith("34") ? digits : "34" + digits;
                window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent("Hola " + item.customerName + ", tenemos un hueco disponible en Barbería Rivas. ¿Te interesa?"), "_blank", "noopener");
                api("/api/admin/waitlist/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "Avisado" }) }).then(loadWaitlist).catch(error => showToast(error.message));
            });
            card.querySelectorAll("button")[1].addEventListener("click", function () { api("/api/admin/waitlist/" + item.id, { method: "PATCH", body: JSON.stringify({ status: "Resuelto" }) }).then(loadWaitlist).catch(error => showToast(error.message)); });
            list.append(card);
        });
    } catch (error) { showToast(error.message); }
}
document.querySelector("#waitlist-form").addEventListener("submit", async function (event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    try { await api("/api/admin/waitlist", { method: "POST", body: JSON.stringify({ name: data.get("name"), phone: data.get("phone"), serviceId: data.get("serviceId") || null, preferredDate: data.get("preferredDate") || null, preferredTime: data.get("preferredTime"), notes: data.get("notes") }) }); form.reset(); await loadWaitlist(); showToast("Añadido a la lista de espera."); }
    catch (error) { document.querySelector("#waitlist-feedback").textContent = error.message; }
});
function populateWaitlistServices() {
    const select = document.querySelector("#waitlist-service"); if (!select) return;
    select.innerHTML = '<option value="">Cualquier servicio</option>';
    services.forEach(function (service) { const option = document.createElement("option"); option.value = service.id; option.textContent = service.name; select.append(option); });
}

configureTimeOptions();
populateWaitlistServices();
adminDate.addEventListener("change", configureTimeOptions);
updateBlockFormFields();
document.querySelector("#block-start-date").min = dateKey(new Date());
document.querySelector("#block-end-date").min = dateKey(new Date());
document.querySelector("#block-start-date").addEventListener("change", function () { document.querySelector("#block-end-date").min = this.value; });
adminDate.min = dateKey(new Date());
api("/api/admin/me").then(showAdmin).catch(showLogin);
