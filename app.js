const DEFAULT_ALLOWANCE = 100;
const balanceRef = firebase.database().ref("balanceData");

/* ------------------ DATE HELPERS ------------------ */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateKey(date) {
  const d = startOfDay(date);
  return d.toISOString().split("T")[0];
}

/* ------------------ SHOW TODAY ------------------ */
document.getElementById("currentDate").innerText =
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

/* ------------------ INIT APP ------------------ */
async function initApp() {
  const snap = await balanceRef.once("value");
  let data = snap.val();

  if (!data) {
    const today = startOfDay(new Date());
    data = {
      currentBalance: 0,
      dailyAllowance: DEFAULT_ALLOWANCE,
      lastProcessedDate: dateKey(today),
      ledger: {},
      dailyClosingBalance: {}
    };
    await balanceRef.set(data);
  }

  await processAllowances(data);
}

/* ------------------ DAILY ALLOWANCE ENGINE ------------------ */
async function processAllowances(data) {
  let { currentBalance, dailyAllowance, lastProcessedDate } = data;

  const today = startOfDay(new Date());
  let cursor = startOfDay(new Date(lastProcessedDate));

  while (true) {
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);

    // Only process fully completed days
    if (nextDay >= today) break;

    cursor = nextDay;
    const key = dateKey(cursor);
    const dayLedgerRef = balanceRef.child(`ledger/${key}`);

    const snap = await dayLedgerRef.once("value");
    const entries = snap.val() || {};

    const alreadyHasAllowance = Object.values(entries).some(
      e => e.type === "allowance"
    );

    if (!alreadyHasAllowance) {
      await dayLedgerRef.push({
        type: "allowance",
        amount: dailyAllowance,
        timestamp: cursor.getTime()
      });

      currentBalance += dailyAllowance;

      await balanceRef.child("dailyClosingBalance").update({
        [key]: currentBalance
      });
    }
  }

  await balanceRef.update({
    currentBalance,
    lastProcessedDate: dateKey(today)
  });
}

/* ------------------ REACTIVE UI ------------------ */
balanceRef.on("value", snap => {
  const data = snap.val();
  if (!data) return;

  document.getElementById("balance").innerText =
    data.currentBalance.toFixed(2);

  document.getElementById("dailyAllowance").value =
    data.dailyAllowance;

  renderDailyChart(data.ledger || {});
  renderWeeklyChart(data.dailyClosingBalance || {});
  renderMonthlyChart(data.dailyClosingBalance || {});
});

/* ------------------ ACTIONS ------------------ */
window.setCurrentBalance = function () {
  const val = parseFloat(document.getElementById("setBalance").value);
  if (isNaN(val)) return;
  balanceRef.update({ currentBalance: val });
};

window.updateAllowance = function () {
  const val = parseFloat(document.getElementById("dailyAllowance").value);
  if (isNaN(val)) return;
  balanceRef.update({ dailyAllowance: val });
};

window.spend = async function () {
  const amountInput = document.getElementById("spent");
  const dateInput = document.getElementById("spendDate");
  const noteInput = document.getElementById("spendNote");

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return;

  const spendDate = dateInput.value
    ? new Date(dateInput.value + "T00:00:00")
    : new Date();

  const dayKey = dateKey(spendDate);

  await balanceRef.child(`ledger/${dayKey}`).push({
    type: "spend",
    amount: -amount,
    note: noteInput.value || "",
    timestamp: Date.now()
  });

  await recalcFrom(dayKey);

  amountInput.value = "";
  dateInput.value = "";
  noteInput.value = "";
};

// ------------------ ADD BONUS ------------------
window.addBonus = async function () {
  const amountInput = document.getElementById("bonusAmount");
  const dateInput = document.getElementById("bonusDate");
  const noteInput = document.getElementById("bonusNote");

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return;

  const bonusDate = dateInput.value
    ? new Date(dateInput.value + "T00:00:00")
    : new Date();

  const dayKey = dateKey(bonusDate);

  await balanceRef.child(`ledger/${dayKey}`).push({
    type: "bonus",
    amount: amount, // positive
    note: noteInput.value || "",
    timestamp: Date.now()
  });

  await recalcFrom(dayKey);

  amountInput.value = "";
  dateInput.value = "";
  noteInput.value = "";
};

// ------------------ UNDO ANY ENTRY ------------------
window.undoEntry = async function (day, entryId) {
  await balanceRef.child(`ledger/${day}/${entryId}`).remove();
  await recalcFrom(day);
};

/* ------------------ REBALANCING ------------------ */
async function recalcFrom(startKey) {
  const snap = await balanceRef.once("value");
  const data = snap.val();
  if (!data) return;

  const ledger = data.ledger || {};
  const closing = data.dailyClosingBalance || {};

  const priorDates = Object.keys(closing)
    .filter(d => d < startKey)
    .sort();

  let running =
    priorDates.length > 0
      ? closing[priorDates[priorDates.length - 1]]
      : 0;

  const dates = Object.keys(ledger).sort();

  for (const date of dates) {
    if (date < startKey) continue;

    Object.values(ledger[date]).forEach(entry => {
      running += entry.amount;
    });

    await balanceRef.child("dailyClosingBalance").update({
      [date]: running
    });
  }

  await balanceRef.update({ currentBalance: running });
}

/* ------------------ RENDERING ------------------ */
function renderDailyChart(ledger) {
  const container = document.getElementById("dailyChart");
  container.innerHTML = "";

  const today = startOfDay(new Date());

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);

    if (!ledger[key]) continue;

    let dailyTotal = 0;
    Object.values(ledger[key]).forEach(e => {
      if (e.type === "spend") dailyTotal += Math.abs(e.amount);
    });

    const details = document.createElement("details");
    if (i === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.innerText =
      (i === 0 ? "Today" : d.toLocaleDateString()) +
      ` — Spent: $${dailyTotal.toFixed(2)}`;

    details.appendChild(summary);

    Object.entries(ledger[key]).forEach(([id, entry]) => {
  const row = document.createElement("div");
  row.className = "spend-row";

  // Create spans for type and amount
  const typeSpan = document.createElement("span");
  typeSpan.innerText = `${entry.type}: `;

  const amountSpan = document.createElement("span");
  const amountDisplay = entry.type === "spend" ? -entry.amount : entry.amount;
  amountSpan.innerText = `$${Math.abs(amountDisplay).toFixed(2)}`;

  // Color the amount only
  if (entry.type === "spend") {
    amountSpan.style.color = "red";
    amountSpan.style.fontWeight = "bold";
  } else if (entry.type === "bonus" || entry.type === "allowance") {
    amountSpan.style.color = "green";
    amountSpan.style.fontWeight = "bold";
  }

  // Wrap type + amount + note in a text container
  const textSpan = document.createElement("span");
  textSpan.className = "text";
  textSpan.appendChild(typeSpan);
  textSpan.appendChild(amountSpan);

  // Add note if it exists
  if (entry.note) {
    const noteSpan = document.createElement("span");
    noteSpan.innerText = `— ${entry.note}`;
    textSpan.appendChild(noteSpan);
  }

  row.appendChild(textSpan);

  // Add Undo button (aligned to far right via CSS)
  const btn = document.createElement("button");
  btn.innerText = "Undo";
  btn.onclick = () => undoEntry(key, id);
  row.appendChild(btn);

  details.appendChild(row);
});


    container.appendChild(details);
  }
}

function renderWeeklyChart(balances) {
  const container = document.getElementById("weeklyChart");
  container.innerHTML = "";

  Object.entries(balances).forEach(([d, bal]) => {
    const row = document.createElement("div");
    row.innerText = `${d}: $${bal.toFixed(2)}`;
    container.appendChild(row);
  });
}

function renderMonthlyChart(balances) {
  const container = document.getElementById("monthlyChart");
  container.innerHTML = "";

  Object.entries(balances).forEach(([d, bal]) => {
    const row = document.createElement("div");
    row.innerText = `${d}: $${bal.toFixed(2)}`;
    container.appendChild(row);
  });
}

/* ------------------ START ------------------ */
initApp();
