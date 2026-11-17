const menuToggle = document.querySelector("#menu-toggle");
const mainNav = document.querySelector("#main-nav");
const serviceGrid = document.querySelector("#service-grid");
const bookingForm = document.querySelector("#booking-form");
const bookingService = document.querySelector("#booking-service");
const bookingDate = document.querySelector("#booking-date");
const bookingTime = document.querySelector("#booking-time");
const bookingFeedback = document.querySelector("#booking-feedback");

const yearElement = document.querySelector("#year");
if (yearElement) yearElement.textContent = new Date().getFullYear();

if (menuToggle && mainNav) {
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
}

async function loadPublicHours() {
    const target = document.querySelector("#public-hours");
    if (!target) return;
    try {
        const response = await fetch("/api/hours");
        if (!response.ok) throw new Error("Horario no disponible");
        const hours = await response.json();
        const names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const schemaDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const lines = [];
        names.forEach(function (name, weekday) {
            const periods = hours.filter(function (item) { return Number(item.weekday) === weekday; })
                .sort(function (a, b) { return Number(a.period) - Number(b.period); });
            if (periods.length) {
                lines.push(name + ": " + periods.map(function (item) {
                    return item.startTime + "–" + item.endTime;
                }).join(" · "));
            }
        });
        target.replaceChildren();
        if (!lines.length) {
            target.textContent = "Actualmente no hay horario de atención publicado.";
        } else {
            lines.forEach(function (line, index) {
                if (index) target.append(document.createElement("br"));
                target.append(document.createTextNode(line));
            });
        }
        const schema = document.querySelector('script[type="application/ld+json"]');
        if (schema) {
            try {
                const data = JSON.parse(schema.textContent);
                data.openingHoursSpecification = hours.map(function (item) {
                    return {
                        "@type": "OpeningHoursSpecification",
                        dayOfWeek: schemaDays[item.weekday],
                        opens: item.startTime,
                        closes: item.endTime
                    };
                });
                schema.textContent = JSON.stringify(data);
            } catch (error) { console.warn("No se ha podido actualizar el horario estructurado.", error); }
        }
    } catch (error) {
        target.textContent = "Consulta nuestro horario por WhatsApp.";
    }
}

function showBookingPopup(message) {
    const popup = document.querySelector("#site-toast");
    if (!popup) {
        if (bookingFeedback) bookingFeedback.textContent = message;
        else console.error(message);
        return;
    }

    popup.textContent = message;
    popup.classList.add("is-visible");
    clearTimeout(showBookingPopup.timer);
    showBookingPopup.timer = setTimeout(function () {
        popup.classList.remove("is-visible");
    }, 6500);
}

function formatNextAppointment(value) {
    if (!value) return "No hay una fecha disponible en los próximos 60 días";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Consulta disponibilidad por WhatsApp";
    return new Intl.DateTimeFormat("es-ES", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
    }).format(date);
}

function normalizeService(service) {
    const priceValue = service.price ?? service.Price ?? null;
    const durationValue = service.durationMinutes ?? service.duration_minutes ?? service.DurationMinutes ?? null;
    const numericPrice = priceValue === null || priceValue === "" ? null : Number(priceValue);
    const numericDuration = durationValue === null || durationValue === "" ? null : Number(durationValue);

    return {
        id: service.id ?? service.Id,
        name: service.name ?? service.Name ?? "Servicio",
        description: service.description ?? service.Description ?? "",
        price: Number.isFinite(numericPrice) ? numericPrice : null,
        durationMinutes: Number.isFinite(numericDuration) ? numericDuration : null
    };
}

function renderServiceCard(service, index) {
    const card = document.createElement("article");
    card.className = "service-card";

    const top = document.createElement("div");
    top.className = "service-card-top";

    const number = document.createElement("span");
    number.className = "service-number";
    number.textContent = "SERVICIO " + String(index + 1).padStart(2, "0");

    const tag = document.createElement("span");
    tag.className = "service-tag";
    tag.textContent = "BARBERÍA RIVAS";
    top.append(number, tag);

    const title = document.createElement("h3");
    title.textContent = service.name;

    const description = document.createElement("p");
    description.className = "service-description";
    description.textContent = service.description || "Un servicio pensado para cuidar tu imagen y adaptarse a tu estilo.";

    const priceRow = document.createElement("div");
    priceRow.className = "service-price-row";

    const priceWrap = document.createElement("div");
    const priceLabel = document.createElement("span");
    priceLabel.className = "service-price-label";
    priceLabel.textContent = service.price === null ? "Tarifa" : "Precio";

    const price = document.createElement("strong");
    price.className = "service-price";
    price.textContent = service.price === null
        ? "CONSULTAR"
        : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(service.price);
    priceWrap.append(priceLabel, price);

    const duration = document.createElement("span");
    duration.className = "service-duration";
    duration.textContent = service.durationMinutes === null
        ? "Duración a consultar"
        : service.durationMinutes + " min";
    priceRow.append(priceWrap, duration);

    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "service-book-button";
    choose.textContent = "Reservar este servicio";
    choose.addEventListener("click", function () {
        if (!bookingService) return;
        bookingService.value = service.id;
        bookingService.dispatchEvent(new Event("change", { bubbles: true }));
        const bookingSection = document.querySelector("#reservar");
        if (bookingSection) bookingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        bookingService.focus({ preventScroll: true });
    });

    const bottom = document.createElement("div");
    bottom.className = "service-card-bottom";
    bottom.append(priceRow, choose);
    card.append(top, title, description, bottom);
    return card;
}


async function loadInstagramFeed() {
    const grid = document.querySelector("#instagram-grid");
    const footnote = document.querySelector("#instagram-footnote");
    if (!grid) return;

    try {
        const response = await fetch("/api/instagram-feed");
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se han podido cargar las publicaciones.");

        const posts = Array.isArray(result.posts) ? result.posts : [];
        if (!result.configured || !posts.length) {
            grid.replaceChildren();
            const empty = document.createElement("div");
            empty.className = "instagram-empty";
            empty.append(document.createTextNode(result.configured
                ? "Todavía no hay publicaciones disponibles. Mientras tanto, descubre todos nuestros trabajos en Instagram."
                : "Estamos preparando la conexión con Instagram. Mientras tanto, puedes descubrir nuestros trabajos en el perfil."));
            const link = document.createElement("a");
            link.href = "https://www.instagram.com/barberia_rivas/";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "VER INSTAGRAM ↗";
            empty.append(document.createElement("br"), link);
            grid.append(empty);
            if (footnote) footnote.textContent = "Síguenos en Instagram para descubrir los últimos cortes y novedades.";
            return;
        }

        grid.replaceChildren();
        posts.slice(0, 6).forEach(function (post) {
            if (!post || !post.permalink) return;
            const mediaUrl = post.mediaType === "VIDEO" ? (post.thumbnailUrl || post.mediaUrl) : (post.mediaUrl || post.thumbnailUrl);
            if (!mediaUrl) return;

            const link = document.createElement("a");
            link.className = "instagram-card";
            link.href = post.permalink;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", "Ver publicación de Barbería Rivas en Instagram");

            const image = document.createElement("img");
            image.src = mediaUrl;
            image.alt = post.caption ? post.caption.slice(0, 140) : "Trabajo de Barbería Rivas";
            image.loading = "lazy";
            image.decoding = "async";

            const label = document.createElement("span");
            label.className = "instagram-card-label";
            const type = document.createElement("span");
            type.textContent = post.mediaType === "VIDEO" ? "REEL / VÍDEO" : "BARBERÍA RIVAS";
            const arrow = document.createElement("span");
            arrow.textContent = "VER PUBLICACIÓN ↗";
            label.append(type, arrow);
            link.append(image, label);
            grid.append(link);
        });

        if (!grid.children.length) {
            const empty = document.createElement("div");
            empty.className = "instagram-empty";
            empty.textContent = "Puedes ver nuestras últimas publicaciones directamente en Instagram.";
            grid.append(empty);
        }
        if (footnote) footnote.textContent = "Las publicaciones más recientes de @barberia_rivas · Actualización automática.";
    } catch (error) {
        grid.replaceChildren();
        const fallback = document.createElement("div");
        fallback.className = "instagram-empty";
        fallback.textContent = "No hemos podido cargar Instagram en este momento. Puedes ver las publicaciones en nuestro perfil.";
        const link = document.createElement("a");
        link.href = "https://www.instagram.com/barberia_rivas/";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "ABRIR INSTAGRAM ↗";
        fallback.append(document.createElement("br"), link);
        grid.append(fallback);
        if (footnote) footnote.textContent = "Instagram · @barberia_rivas";
    }
}

let availabilityRequest = 0;

async function updateAvailableTimes() {
    if (!bookingForm || !bookingDate || !bookingService || !bookingTime) return;

    const requestId = ++availabilityRequest;
    const selectedDate = bookingDate.value;
    const serviceId = bookingService.value;
    const submitButton = bookingForm.querySelector("button[type='submit']");

    bookingTime.innerHTML = '<option value="">Selecciona una hora</option>';
    bookingTime.disabled = true;
    if (submitButton) submitButton.disabled = true;

    if (!selectedDate || !serviceId) {
        if (submitButton) submitButton.disabled = false;
        return;
    }

    try {
        const response = await fetch("/api/availability?date=" + encodeURIComponent(selectedDate) +
            "&serviceId=" + encodeURIComponent(serviceId));
        const result = await response.json();
        if (requestId !== availabilityRequest) return;
        if (!response.ok) throw new Error(result.message || "No se ha podido consultar la disponibilidad.");

        const availableTimes = Array.isArray(result.availableTimes) ? result.availableTimes : [];
        availableTimes.forEach(function (slot) {
            const option = document.createElement("option");
            option.value = slot;
            option.textContent = slot;
            bookingTime.append(option);
        });

        bookingTime.disabled = availableTimes.length === 0;
        if (submitButton) submitButton.disabled = availableTimes.length === 0;

        if (!availableTimes.length) {
            showBookingPopup("NO HAY CITAS DISPONIBLES PARA EL DÍA SELECCIONADO. PRÓXIMA CITA LIBRE: " +
                formatNextAppointment(result.nextAvailable) + ".");
        }
    } catch (error) {
        if (requestId !== availabilityRequest) return;
        showBookingPopup(error.message || "No se ha podido consultar la disponibilidad.");
        bookingTime.disabled = true;
        if (submitButton) submitButton.disabled = true;
    }
}

async function loadServices() {
    try {
        const response = await fetch("/api/services");
        if (!response.ok) throw new Error("No se ha podido cargar el catálogo.");
        const data = await response.json();
        const services = Array.isArray(data) ? data.map(normalizeService) : [];

        if (bookingService) {
            bookingService.querySelectorAll("option:not(:first-child)").forEach(function (option) {
                option.remove();
            });
        }

        if (!services.length) {
            if (serviceGrid) serviceGrid.innerHTML = '<p class="service-message">Estamos preparando nuestro catálogo. Mientras tanto, puedes consultarnos por WhatsApp.</p>';
            return;
        }

        if (serviceGrid) {
            serviceGrid.innerHTML = "";
            services.forEach(function (service, index) {
                serviceGrid.append(renderServiceCard(service, index));
            });
        }

        if (bookingService) {
            services.forEach(function (service) {
                const option = document.createElement("option");
                option.value = service.id;
                option.textContent = service.name;
                bookingService.append(option);
            });
        }
    } catch (error) {
        if (serviceGrid) serviceGrid.innerHTML = '<p class="service-message">En breve podrás consultar nuestros servicios aquí. Para cualquier consulta, escríbenos por WhatsApp.</p>';
        showBookingPopup("No se ha podido cargar el catálogo de servicios.");
    }
}

if (bookingDate) {
    const today = new Date();
    bookingDate.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    bookingDate.addEventListener("change", updateAvailableTimes);
}
if (bookingService) bookingService.addEventListener("change", updateAvailableTimes);

if (bookingForm) {
    bookingForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (bookingFeedback) {
            bookingFeedback.textContent = "";
            bookingFeedback.className = "booking-feedback";
        }

        const formData = new FormData(bookingForm);
        const requestedAt = formData.get("date") + "T" + formData.get("time") + ":00";
        const payload = {
            serviceId: formData.get("serviceId"),
            name: formData.get("name"),
            phone: formData.get("phone"),
            notes: formData.get("notes"),
            requestedAt: requestedAt
        };

        const submitButton = bookingForm.querySelector("button[type='submit']");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Enviando solicitud…";
        }

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

            if (bookingFeedback) {
                bookingFeedback.textContent = "¡Solicitud enviada! La barbería revisará tu petición y te confirmará la cita.";
                bookingFeedback.classList.add("success");
            }
            showBookingPopup("¡Solicitud enviada! La barbería revisará tu petición y te confirmará la cita.");
            bookingForm.reset();
            if (bookingTime) {
                bookingTime.innerHTML = '<option value="">Selecciona una hora</option>';
                bookingTime.disabled = true;
            }
            if (submitButton) submitButton.disabled = false;
        } catch (error) {
            if (bookingFeedback) {
                bookingFeedback.textContent = error.message;
                bookingFeedback.classList.add("error");
            }
            showBookingPopup(error.message || "No se ha podido enviar la solicitud.");
            await updateAvailableTimes();
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Enviar solicitud";
            }
        }
    });
}

loadServices();
loadPublicHours();
loadInstagramFeed();
