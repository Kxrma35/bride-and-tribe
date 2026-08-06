const API = "http://localhost:5000/api";

const fmtKes = (n) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(n);

// Mobile menu toggle
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("mobile-menu").classList.toggle("hidden");
});

// Load dresses
async function loadDresses() {
  try {
    const res = await fetch(`${API}/dresses`);
    const data = await res.json();
    const grid = document.getElementById("dress-grid");
    grid.innerHTML = data.dresses
      .map(
        (d) => `
      <a href="#" class="group text-center" data-dress-id="${d.id}">
        <div class="aspect-[3/4] rounded bg-gradient-to-br from-peachsoft via-peach to-beige
                    flex items-center justify-center transition
                    group-hover:-translate-y-1 group-hover:shadow-xl">
          <span class="text-6xl opacity-50">&#128087;</span>
        </div>
        <p class="font-sans text-xs tracking-[0.28em] uppercase text-beige mt-4">${d.designer}</p>
        <p class="text-xl mt-1">${d.name}</p>
        <p class="font-sans text-xs text-gray-400 mt-0.5">Style ${d.style_code}</p>
        <p class="font-sans text-sm mt-1.5">${fmtKes(d.price_kes)}</p>
      </a>`
      )
      .join("");
  } catch {
    document.getElementById("dress-error").classList.remove("hidden");
  }
}

// Load testimonials
async function loadTestimonials() {
  try {
    const res = await fetch(`${API}/testimonials`);
    const data = await res.json();
    document.getElementById("testimonial-list").innerHTML = data.testimonials
      .map(
        (t) => `
      <blockquote class="border-l-2 border-beige pl-6">
        <p class="italic leading-relaxed">&ldquo;${t.body}&rdquo;</p>
        <cite class="block font-sans not-italic text-xs tracking-[0.2em] uppercase text-beige mt-2.5">${t.author}</cite>
      </blockquote>`
      )
      .join("");
  } catch {
    /* section stays empty if API is down */
  }
}

// Appointment form
document.getElementById("appointment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const success = document.getElementById("appt-success");
  const error = document.getElementById("appt-error");
  success.classList.add("hidden");
  error.classList.add("hidden");

  try {
    const res = await fetch(`${API}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("appt-name").value,
        phone: document.getElementById("appt-phone").value,
        preferred_date: document.getElementById("appt-date").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    success.classList.remove("hidden");
    e.target.reset();
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove("hidden");
  }
});

loadDresses();
loadTestimonials();