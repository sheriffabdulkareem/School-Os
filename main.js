/* =========================================================
   SCHOOL OS — MAIN JAVASCRIPT
   Animations, navbar behavior, theme and dashboard interaction.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* ---------- SCROLL REVEAL ---------- */
    const revealElements = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    revealElements.forEach(element => revealObserver.observe(element));

    /* ---------- STICKY NAVBAR ---------- */
    const navbar = document.querySelector(".navbar");

    const updateNavbar = () => {
        navbar?.classList.toggle("scrolled", window.scrollY > 20);
    };

    window.addEventListener("scroll", updateNavbar);
    updateNavbar();

    /* ---------- ACTIVE NAVIGATION ---------- */
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".nav-link");

    const sectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(link => link.classList.remove("active"));
                const activeLink = document.querySelector(
                    `.nav-link[href="#${entry.target.id}"]`
                );
                activeLink?.classList.add("active");
            }
        });
    }, { rootMargin: "-35% 0px -55% 0px" });

    sections.forEach(section => sectionObserver.observe(section));

    /* ---------- DASHBOARD TILT ---------- */
    const dashboard = document.querySelector(".dashboard");

    if (dashboard && window.matchMedia("(pointer:fine)").matches) {
        dashboard.addEventListener("mousemove", event => {
            const rect = dashboard.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;

            dashboard.style.transform =
                `perspective(1200px) rotateY(${x * 8 - 5}deg) rotateX(${-y * 5 + 2}deg)`;
        });

        dashboard.addEventListener("mouseleave", () => {
            dashboard.style.transform =
                "perspective(1200px) rotateY(-5deg) rotateX(2deg)";
        });
    }

    /* ---------- DARK MODE ---------- */
    const themeToggle = document.querySelector("#themeToggle");

    const savedTheme = localStorage.getItem("schoolos-theme");

    if (savedTheme === "dark") {
        document.documentElement.dataset.theme = "dark";
        updateThemeIcon();
    }

    themeToggle?.addEventListener("click", () => {
        const isDark = document.documentElement.dataset.theme === "dark";

        if (isDark) {
            delete document.documentElement.dataset.theme;
            localStorage.setItem("schoolos-theme", "light");
        } else {
            document.documentElement.dataset.theme = "dark";
            localStorage.setItem("schoolos-theme", "dark");
        }

        updateThemeIcon();
    });

    function updateThemeIcon() {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector("i");
        if (!icon) return;

        icon.className =
            document.documentElement.dataset.theme === "dark"
                ? "bi bi-sun-fill"
                : "bi bi-moon-stars-fill";
    }

    /* ---------- SMOOTH NAVIGATION ---------- */
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener("click", event => {
            const targetId = link.getAttribute("href");
            if (!targetId || targetId === "#") return;

            const target = document.querySelector(targetId);

            if (target) {
                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth" });
            }
        });
    });

});
