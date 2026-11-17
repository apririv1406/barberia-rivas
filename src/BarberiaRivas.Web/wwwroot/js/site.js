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
