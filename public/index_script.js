const regCard = document.getElementById("registerCard");
const logCard = document.getElementById("loginCard");
document.getElementById("toRegister").onclick = () => {
  logCard.hidden = true;
  regCard.hidden = false;
};
document.getElementById("toLogin").onclick = () => {
  regCard.hidden = true;
  logCard.hidden = false;
};

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

document.getElementById("registerBtn").onclick = async () => {
  const err = document.getElementById("regErr");
  err.textContent = "";
  try {
    const name = document.getElementById("regName").value.trim();
    const surname = document.getElementById("regSurname").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    await post("/api/register", { name, surname, email, password });
    location.href = "/app.html";
  } catch (e) {
    err.textContent = e.message;
  }
};

document.getElementById("loginBtn").onclick = async () => {
  const err = document.getElementById("logErr");
  err.textContent = "";
  try {
    const email = document.getElementById("logEmail").value.trim();
    const password = document.getElementById("logPassword").value;
    await post("/api/login", { email, password });
    location.href = "/app.html";
  } catch (e) {
    err.textContent = e.message;
  }
};
