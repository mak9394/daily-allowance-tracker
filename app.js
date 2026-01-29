const DEFAULT_ALLOWANCE = 100;
const balanceRef = firebase.database().ref("balanceData");

function dateKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Show today's date
document.getElementById("currentDate").innerText =
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

balanceRef.once("value").then((snapshot) => {
  let data = snapshot.val();

  if (!data) {
    const today = startOfDay(new Date());
    data = {
      currentBalance: 0,
      dailyAllowance: DEFAULT_ALLOWANCE,
      lastProcessedDate: dateKey(today),
      ledger: {},
      dailyClosingBalance: {}
    };
    balanceRef.set(data);
  }

  let {
    currentBalance,
    dailyAllowance,
    lastProcessedDate
  } = data;

  const today = startOfDay(new Date());
  let cursor = startOfDay(new Date(lastProcessedDate));

 // Process ONLY fully completed days
while (true) {
  const nextDay = new Date(cursor);
  nextDay.setDate(nextDay.getDate() + 1);

  if (nextDay >= today) break;

  cursor = nextDay;
  const key = dateKey(cursor);

  // Add allowance entry
  balanceRef.child(`ledger/${key}`).push({
    type: "allowance",
    amount: dailyAllowance,
    timestamp: cursor.getTime()
  });

  currentBalance += dailyAllowance;

  // Save closing balance for that day
  balanceRef.child("dailyClosingBalance").update({
    [key]: currentBalance
  });
}

  balanceRef.update({
    currentBalance,
    lastProcessedDate: dateKey(today)
  });

  document.getElementById("balance").innerText =
    currentBalance.toFixed(2);

  document.getElementById("dailyAllowance").value =
    dailyAllowance;

  balanceRef.on("value", (snap) => {
    const updated = snap.val();
    if (!updated) return;

    document.getElementById("balance").innerText =
      updated.currentBalance.toFixed(2);

    renderDailyChart(updated.ledger || {});
    renderWeeklyChart(updated.dailyClosingBalance || {});
    renderMonthlyChart(updated.dailyClosingBalance || {});
  });

  window.spend = function () {
  const input = document.getElementById("spent");
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) return;

const todayStr = dateKey(new Date());

  // Create entry first
  const entryRef = balanceRef.child(`ledger/${todayStr}`).push();

  entryRef
    .set({
      type: "spend",
      amount: -amount,
      timestamp: Date.now()
    })
    .then(() => {
      // Only update balance AFTER entry is saved
      return balanceRef.child("currentBalance").transaction(
        b => (b || 0) - amount
      );
    });

  input.value = "";
};


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
});

window.undoSpend = function (day, entryId, amount) {
  // Remove the ledger entry
  balanceRef.child(`ledger/${day}/${entryId}`).remove();

  // Reverse the balance change
  balanceRef.child("currentBalance").transaction((balance) => {
    return (balance || 0) - amount;
  });
};

function renderDailyChart(ledger) {
  const container = document.getElementById("dailyChart");
  container.innerHTML = "";

  const today = startOfDay(new Date());

  // Show today + previous 6 days (7 total)
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = dateKey(date);

    if (!ledger[key]) continue;

    let dailySpendTotal = 0;

    Object.values(ledger[key]).forEach(entry => {
      if (entry.type === "spend") {
        dailySpendTotal += Math.abs(entry.amount);
      }
    });

    // Collapsible container
    const details = document.createElement("details");
    if (i === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.innerText =
      (i === 0 ? "Today" : date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "numeric",
        day: "numeric",
        year: "numeric"
      })) +
      ` — Spent: $${dailySpendTotal.toFixed(2)}`;

    details.appendChild(summary);

    Object.entries(ledger[key]).forEach(([id, entry]) => {
      const row = document.createElement("div");
      row.className = "spend-row";

      const label = document.createElement("span");
      label.innerText = `${entry.type}: $${Math.abs(entry.amount).toFixed(2)}`;

      row.appendChild(label);

      if (entry.type === "spend") {
        const btn = document.createElement("button");
        btn.innerText = "Undo";
        btn.onclick = () => undoSpend(key, id, entry.amount);
        row.appendChild(btn);
      }

      details.appendChild(row);
    });

    container.appendChild(details);
  }
}



function renderWeeklyChart(dailyBalances) {
  const container = document.getElementById("weeklyChart");
  container.innerHTML = "";

  const now = new Date();
  const end = startOfDay(now);
  end.setDate(end.getDate() - end.getDay());
  const start = new Date(end);
  start.setDate(start.getDate() - 7);

  Object.entries(dailyBalances).forEach(([day, bal]) => {
    const d = new Date(day);
    if (d >= start && d < end) {
      const row = document.createElement("div");
      row.className = "day-summary";
      row.style.color = bal >= 0 ? "green" : "red";
      row.innerText = `${day}: $${bal.toFixed(2)}`;
      container.appendChild(row);
    }
  });
}

function renderMonthlyChart(dailyBalances) {
  const container = document.getElementById("monthlyChart");
  container.innerHTML = "";

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  Object.entries(dailyBalances).forEach(([day, bal]) => {
    const d = new Date(day);
    if (d >= start && d <= end) {
      const row = document.createElement("div");
      row.className = "day-summary";
      row.style.color = bal >= 0 ? "green" : "red";
      row.innerText = `${day}: $${bal.toFixed(2)}`;
      container.appendChild(row);
    }
  });
}
