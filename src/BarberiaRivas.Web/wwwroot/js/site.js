const menuToggle = document.querySelector("#menu-toggle");
const mainNav = document.querySelector("#main-nav");
const serviceGrid = document.querySelector("#service-grid");

document.querySelector("#year").textContent = new Date().getFullYear();

menuToggle.addEventListener("click", function () {
    const isOpen = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
});

mainNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Abrir menú");
    });
});

async function loadServices() {
    try {
        const response = await fetch("/api/services");

        if (!response.ok) {
            throw new Error("No se ha podido cargar el catálogo.");
        }

        const services = await response.json();

        if (!services.length) {
            serviceGrid.innerHTML = '<p class="service-message">Estamos preparando nuestro catálogo. Mientras tanto, puedes consultarnos por WhatsApp.</p>';
            return;
        }

        serviceGrid.innerHTML = "";

        services.forEach(function (service, index) {
            const card = document.createElement("article");
            card.className = "service-card";

            const number = document.createElement("span");
            number.className = "service-number";
            number.textContent = String(index + 1).padStart(2, "0");

            const title = document.createElement("h3");
            title.textContent = service.name;

            const meta = document.createElement("p");
            meta.className = "service-meta";

            const details = [];
            if (service.price !== null) {
                details.push(new Intl.NumberFormat("es-ES", {
                    style: "currency",
                    currency: "EUR"
                }).format(service.price));
            }
            if (service.durationMinutes !== null) {
                details.push(service.durationMinutes + " min");
            }
            meta.textContent = details.length ? details.join(" · ") : "Consulta disponibilidad y precio";

            card.append(number, title, meta);

            if (service.description) {
                const description = document.createElement("p");
                description.className = "service-meta";
                description.textContent = service.description;
                card.append(description);
            }

            serviceGrid.append(card);
        });
    } catch (error) {
        serviceGrid.innerHTML = '<p class="service-message">En breve podrás consultar nuestros servicios aquí. Para cualquier consulta, escríbenos por WhatsApp.</p>';
    }
}

loadServices();


const bookingForm = document.querySelector("#booking-form");
const bookingService = document.querySelector("#booking-service");
const bookingDate = document.querySelector("#booking-date");
const bookingTime = document.querySelector("#booking-time");
const bookingFeedback = document.querySelector("#booking-feedback");

function configureBookingFields() {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 10);
    bookingDate.min = localToday;

    function updateAvailableTimes() {
        const selectedDate = bookingDate.value;
        const current = new Date();
        const todayKey = new Date(current.getTime() - current.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 10);
        const isToday = selectedDate === todayKey;
        const currentMinutes = current.getHours() * 60 + current.getMinutes();
        const previousValue = bookingTime.value;

        bookingTime.innerHTML = '<option value="">Selecciona una hora</option>';

        const slots = [];
        [[10, 0, 14, 0], [16, 0, 20, 0]].forEach(function (period) {
            let minutes = period[0] * 60 + period[1];
            const end = period[2] * 60 + period[3];
            while (minutes < end) {
                if (!isToday || minutes > currentMinutes) {
                    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
                    const mins = String(minutes % 60).padStart(2, "0");
                    slots.push(hours + ":" + mins);
                }
                minutes += 30;
            }
        });

        slots.forEach(function (slot) {
            const option = document.createElement("option");
            option.value = slot;
            option.textContent = slot;
            bookingTime.append(option);
        });

        if (slots.includes(previousValue)) bookingTime.value = previousValue;
    }

    bookingDate.addEventListener("change", updateAvailableTimes);
    updateAvailableTimes();
}

function populateBookingServices(services) {
    services.forEach(function (service) {
        const option = document.createElement("option");
        option.value = service.id;
        option.textContent = service.name;
        bookingService.append(option);
    });
}

bookingForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    bookingFeedback.textContent = "";
    bookingFeedback.className = "booking-feedback";

    const formData = new FormData(bookingForm);
    const requestedAt = formData.get("date") + "T" + formData.get("time") + ":00";

    const payload = {
        serviceId: formData.get("serviceId"),
        name: formData.get("name"),
        phone: formData.get("phone"),
        email: formData.get("email"),
        notes: formData.get("notes"),
        requestedAt: requestedAt
    };

    const submitButton = bookingForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Enviando solicitud…";

    try {
        const response = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            const message = result.message ||
                (result.errors ? Object.values(result.errors).flat().join(" ") : null) ||
                "No se ha podido enviar la solicitud. Comprueba los datos e inténtalo de nuevo.";
            throw new Error(message);
        }

        bookingFeedback.textContent = "¡Solicitud enviada! La barbería revisará tu petición y te confirmará la cita. Si lo prefieres, también puedes escribirnos por WhatsApp.";
        bookingFeedback.classList.add("success");
        bookingForm.reset();
    } catch (error) {
        bookingFeedback.textContent = error.message;
        bookingFeedback.classList.add("error");
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Enviar solicitud <span>↗</span>';
    }
});

configureBookingFields();
fetch("/api/services")
    .then(function (response) {
        if (!response.ok) throw new Error("Servicios no disponibles");
        return response.json();
    })
    .then(populateBookingServices)
    .catch(function () {
        bookingFeedback.textContent = "No se ha podido cargar el catálogo. Puedes pedir tu cita por WhatsApp.";
    });
