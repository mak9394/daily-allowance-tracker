const DEFAULT_ALLOWANCE = 100;
const balanceRef = firebase.database().ref("balanceData");

function dateKey(date) {
  return date.toISOString().split("T")[0];
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

  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    const key = dateKey(cursor);

    balanceRef.child(`ledger/${key}`).push({
      type: "allowance",
      amount: dailyAllowance,
      timestamp: cursor.getTime()
    });

    currentBalance += dailyAllowance;

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

    balanceRef.child(`ledger/${todayStr}`).push({
      type: "spend",
      amount: -amount,
      timestamp: Date.now()
    });

    balanceRef.child("currentBalance").transaction(b => (b || 0) - amount);
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

  const today = dateKey(new Date());
  if (!ledger[today]) return;

  Object.entries(ledger[today]).forEach(([id, entry]) => {
    const row = document.createElement("div");
    row.className = "spend-row";

    // Label
    const label = document.createElement("span");
    label.innerText = `${entry.type}: $${Math.abs(entry.amount).toFixed(2)}`;

    row.appendChild(label);

    // Only allow undo for spends
    if (entry.type === "spend") {
      const btn = document.createElement("button");
      btn.innerText = "Undo";
      btn.onclick = () => undoSpend(today, id, entry.amount);
      row.appendChild(btn);
    }

    container.appendChild(row);
  });
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
