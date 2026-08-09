const API = location.port === "5500" ? "http://localhost:5000/api" : "/api";

const $ = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem("bt_token");

// ==================== Tilt showcase ====================

const tiltZone = $("tilt-zone");
const tiltCard = $("tilt-card");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (tiltZone && tiltCard && !reduceMotion) {
  tiltZone.addEventListener("mousemove", (e) => {
    const rect = tiltZone.getBoundingClientRect();
    const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    tiltCard.style.transform =
      `perspective(1200px) rotateX(${-dy * 16}deg) rotateY(${dx * 16}deg)`;
  });
  tiltZone.addEventListener("mouseleave", () => {
    tiltCard.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
  });
}

// ==================== Modal plumbing ====================

let pollTimer = null;

function openModal(id) {
  $("modal-backdrop").classList.remove("hidden");
  ["auth-modal", "booking-modal"].forEach((m) =>
    $(m).classList.toggle("hidden", m !== id)
  );
  document.body.style.overflow = "hidden";
}

function closeModals() {
  $("modal-backdrop").classList.add("hidden");
  document.body.style.overflow = "";
  clearInterval(pollTimer);
}

document.querySelectorAll(".modal-close").forEach((b) =>
  b.addEventListener("click", closeModals)
);
$("backdrop-click").addEventListener("click", closeModals);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModals();
});

// ==================== Auth ====================

let authMode = "signin";

function showAuth(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("auth-title").textContent = signup ? "Create Your Account" : "Welcome Back";
  $("auth-sub").textContent = signup
    ? "Join the Bride and Tribe family."
    : "Sign in to manage your appointments.";
  $("auth-submit").textContent = signup ? "Create Account" : "Sign In";
  $("auth-switch-label").textContent = signup
    ? "Already have an account?"
    : "Don't have an account?";
  $("auth-toggle").textContent = signup ? "Sign In" : "Create one";
  $("auth-name-wrap").classList.toggle("hidden", !signup);
  $("auth-error").classList.add("hidden");
  openModal("auth-modal");
}

document.querySelectorAll("[data-auth]").forEach((b) =>
  b.addEventListener("click", () => showAuth(b.dataset.auth))
);

$("auth-toggle").addEventListener("click", () =>
  showAuth(authMode === "signin" ? "signup" : "signin")
);

$("auth-submit").addEventListener("click", async () => {
  const endpoint = authMode === "signup" ? "register" : "login";
  const body = {
    email: $("auth-email").value.trim(),
    password: $("auth-password").value,
  };
  if (authMode === "signup") body.name = $("auth-name").value.trim();

  try {
    const res = await fetch(`${API}/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    localStorage.setItem("bt_token", data.token);
    localStorage.setItem("bt_name", data.user.name);
    reflectAuthState();
    closeModals();
  } catch (err) {
    $("auth-error").textContent = err.message;
    $("auth-error").classList.remove("hidden");
  }
});

function reflectAuthState() {
  const name = localStorage.getItem("bt_name");
  const chip = $("user-chip");
  const signInBtn = document.querySelector("header [data-auth='signin']");
  if (getToken() && name) {
    chip.textContent = `Karibu, ${name.split(" ")[0]}`;
    chip.classList.remove("hidden");
    if (signInBtn) signInBtn.classList.add("hidden");
  } else {
    chip.classList.add("hidden");
    if (signInBtn) signInBtn.classList.remove("hidden");
  }
}
reflectAuthState();

// ==================== Booking flow ====================

const BK_STEPS = ["bk-form", "bk-payment", "bk-waiting", "bk-success", "bk-failed"];

function showBookingStep(step) {
  BK_STEPS.forEach((s) => $(s).classList.toggle("hidden", s !== step));
  const labels = {
    "bk-form": ["Step 1 of 2 — Details", "Book Your Appointment"],
    "bk-payment": ["Step 2 of 2 — Payment", "Secure Your Booking"],
    "bk-waiting": ["Payment", "Almost There"],
    "bk-success": ["Confirmed", "You're All Set"],
    "bk-failed": ["Payment", "Something Went Wrong"],
  };
  $("bk-step-label").textContent = labels[step][0];
  $("bk-title").textContent = labels[step][1];
}

document.querySelectorAll("[data-book]").forEach((b) =>
  b.addEventListener("click", () => {
    showBookingStep("bk-form");
    openModal("booking-modal");
  })
);

$("bk-continue").addEventListener("click", () => {
  const err = $("bk-form-error");
  err.classList.add("hidden");
  if (!$("bk-name").value.trim() || !$("bk-phone").value.trim()) {
    err.textContent = "Name and phone number are required";
    err.classList.remove("hidden");
    return;
  }
  // Prefill the M-Pesa number with the contact number
  if (!$("bk-mpesa").value) $("bk-mpesa").value = $("bk-phone").value;
  showBookingStep("bk-payment");
});

$("bk-pay").addEventListener("click", async () => {
  const err = $("bk-pay-error");
  err.classList.add("hidden");
  const mpesaPhone = $("bk-mpesa").value.trim();
  if (!mpesaPhone) {
    err.textContent = "Enter the Safaricom number to bill";
    err.classList.remove("hidden");
    return;
  }

  $("bk-pay").disabled = true;
  try {
    const headers = { "Content-Type": "application/json" };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;

    const res = await fetch(`${API}/bookings/pay`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: $("bk-name").value.trim(),
        email: $("bk-email").value.trim(),
        phone: $("bk-phone").value.trim(),
        date: $("bk-date").value,
        time: $("bk-time").value,
        notes: $("bk-notes").value.trim(),
        mpesaPhone,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Payment could not be started");

    $("bk-wait-msg").textContent =
      `We sent an M-Pesa request for KES 5,000 to ${mpesaPhone}. ` +
      `Enter your PIN on the prompt to complete your reservation.`;
    showBookingStep("bk-waiting");
    pollBooking(data.orderId);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove("hidden");
  } finally {
    $("bk-pay").disabled = false;
  }
});

function pollBooking(orderId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/bookings/status/${orderId}`);
      const data = await res.json();
      if (!data.order || data.order.status === "pending") return;
      clearInterval(pollTimer);
      if (data.order.status === "paid") {
        $("bk-summary").innerHTML =
          `<strong>Date:</strong> ${$("bk-date").value || "To be confirmed"}<br />` +
          `<strong>Time:</strong> ${$("bk-time").value || "To be confirmed"}<br />` +
          `<strong>Location:</strong> Bride and Tribe Bridal Atelier, Karen, Nairobi`;
        showBookingStep("bk-success");
      } else {
        showBookingStep("bk-failed");
      }
    } catch {
      /* keep polling */
    }
  }, 4000);
}

$("bk-cancel").addEventListener("click", () => {
  clearInterval(pollTimer);
  showBookingStep("bk-payment");
});

$("bk-retry").addEventListener("click", () => showBookingStep("bk-payment"));

// ==================== Scroll reveal ====================

if (!reduceMotion) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll("section > div").forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    el.style.transition = "opacity 0.8s ease-out, transform 0.8s ease-out";
    observer.observe(el);
  });
}