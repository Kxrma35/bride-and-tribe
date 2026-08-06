const API = location.port === "5500" ? "http://localhost:5000/api" : "/api";;

const fmtKes = (n) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(n);

// ---------- Mobile menu ----------

document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("mobile-menu").classList.toggle("hidden");
});

// ---------- Data loading ----------

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

// ---------- Appointment form ----------

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

// ---------- Scroll reveal animations ----------

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // animate once, then stop watching
      }
    }
  },
  { threshold: 0.15 }
);

function attachReveals() {
  document
    .querySelectorAll("section > div, #dress-grid > a, #testimonial-list > blockquote")
    .forEach((el, i) => {
      el.classList.add("reveal");
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 90}ms`; // stagger within rows
      observer.observe(el);
    });
}

// ---------- Hero parallax ----------

const heroInner = document.querySelector("section .max-w-6xl");
window.addEventListener(
  "scroll",
  () => {
    if (window.scrollY < 900) {
      heroInner.style.transform = `translateY(${window.scrollY * 0.18}px)`;
    }
  },
  { passive: true }
);

// ---------- Boot ----------

Promise.allSettled([loadDresses(), loadTestimonials()]).then(attachReveals);

// ==================== Payment flow ====================

let currentDress = null;
let orderType = "deposit";
let pollTimer = null;
let pendingPayIntent = false;

const $ = (id) => document.getElementById(id);

const getToken = () => localStorage.getItem("bt_token");

// ---------- Modal plumbing ----------

function openModal(id) {
  $("modal-backdrop").classList.remove("hidden");
  ["dress-modal", "status-modal", "auth-modal"].forEach((m) =>
    $(m).classList.toggle("hidden", m !== id)
  );
}

function closeModals() {
  $("modal-backdrop").classList.add("hidden");
  clearInterval(pollTimer);
}

document.querySelectorAll(".modal-close").forEach((b) =>
  b.addEventListener("click", closeModals)
);
$("modal-backdrop").addEventListener("click", (e) => {
  if (e.target === $("modal-backdrop")) closeModals();
});

// ---------- Dress detail ----------

$("dress-grid").addEventListener("click", async (e) => {
  const card = e.target.closest("[data-dress-id]");
  if (!card) return;
  e.preventDefault();
  const res = await fetch(`${API}/dresses/${card.dataset.dressId}`);
  const data = await res.json();
  currentDress = data.dress;

  $("dm-designer").textContent = `${currentDress.designer} · Style ${currentDress.style_code}`;
  $("dm-name").textContent = currentDress.name;
  $("dm-desc").textContent = currentDress.description;
  $("dm-price").textContent = fmtKes(currentDress.price_kes);
  $("dm-deposit").textContent = fmtKes(Math.ceil(currentDress.price_kes * 0.3));
  $("dm-full").textContent = fmtKes(currentDress.price_kes);
  $("pay-error").classList.add("hidden");
  selectOption("deposit");
  openModal("dress-modal");
});

function selectOption(type) {
  orderType = type;
  $("opt-deposit").className = $("opt-deposit").className.replace(
    type === "deposit" ? "border-beige" : "border-navy",
    type === "deposit" ? "border-navy" : "border-beige"
  );
  $("opt-full").className = $("opt-full").className.replace(
    type === "full" ? "border-beige" : "border-navy",
    type === "full" ? "border-navy" : "border-beige"
  );
}
$("opt-deposit").addEventListener("click", () => selectOption("deposit"));
$("opt-full").addEventListener("click", () => selectOption("full"));

// ---------- Auth ----------

let authMode = "login";

function showAuth(mode) {
  authMode = mode;
  $("auth-title").textContent = mode === "login" ? "Sign In" : "Create Account";
  $("auth-submit").textContent = mode === "login" ? "Sign In" : "Sign Up";
  $("auth-toggle").textContent =
    mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in";
  $("auth-name-wrap").classList.toggle("hidden", mode === "login");
  $("auth-error").classList.add("hidden");
  openModal("auth-modal");
}

$("auth-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  showAuth(authMode === "login" ? "register" : "login");
});

$("auth-submit").addEventListener("click", async () => {
  const body = {
    email: $("auth-email").value.trim(),
    password: $("auth-password").value,
  };
  if (authMode === "register") body.name = $("auth-name").value.trim();

  try {
    const res = await fetch(`${API}/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    localStorage.setItem("bt_token", data.token);
    if (pendingPayIntent && currentDress) {
      pendingPayIntent = false;
      openModal("dress-modal");
      startPayment();
    } else {
      closeModals();
    }
  } catch (err) {
    $("auth-error").textContent = err.message;
    $("auth-error").classList.remove("hidden");
  }
});

// ---------- Payment ----------

$("pay-btn").addEventListener("click", () => {
  if (!getToken()) {
    pendingPayIntent = true;
    showAuth("login");
    return;
  }
  startPayment();
});

async function startPayment() {
  const phone = $("pay-phone").value.trim();
  const errBox = $("pay-error");
  errBox.classList.add("hidden");
  if (!phone) {
    errBox.textContent = "Enter the M-Pesa phone number to bill";
    errBox.classList.remove("hidden");
    return;
  }

  $("pay-btn").disabled = true;
  try {
    const res = await fetch(`${API}/mpesa/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ dressId: currentDress.id, phone, orderType }),
    });
    const data = await res.json();
    if (res.status === 401) {
      pendingPayIntent = true;
      showAuth("login");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Payment could not be started");

    $("st-message").textContent =
      `We sent an M-Pesa request for ${fmtKes(data.amount)} to ${phone}. ` +
      `Enter your PIN on the prompt to complete payment.`;
    showStatus("pending");
    openModal("status-modal");
    pollStatus(data.orderId);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove("hidden");
  } finally {
    $("pay-btn").disabled = false;
  }
}

function showStatus(state) {
  ["pending", "paid", "failed"].forEach((s) =>
    $(`st-${s}`).classList.toggle("hidden", s !== state)
  );
}

function pollStatus(orderId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/mpesa/status/${orderId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.order && data.order.status !== "pending") {
        clearInterval(pollTimer);
        showStatus(data.order.status);
      }
    } catch {
      /* keep polling */
    }
  }, 4000);
}

$("st-cancel").addEventListener("click", closeModals);