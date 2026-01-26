const DAILY_ALLOWANCE = 100;

// Reference to shared balance
const balanceRef = firebase.database().ref('balanceData');

// Run once on load
balanceRef.once('value').then((snapshot) => {
  let data = snapshot.val();

  // Initialize if first run
  if (!data) {
    data = {
      currentBalance: 0,
      lastUpdate: new Date().toDateString()
    };
    balanceRef.set(data);
  }

  let balance = data.currentBalance;
  let lastUpdate = data.lastUpdate;
  const today = new Date().toDateString();

  // Add daily allowance if day changed
  if (today !== lastUpdate) {
    balance += DAILY_ALLOWANCE;
    lastUpdate = today;
    balanceRef.update({
      currentBalance: balance,
      lastUpdate: lastUpdate
    });
  }

  // Update UI
  document.getElementById("balance").innerText = balance.toFixed(2);
  document.getElementById("dailyAllowance").innerText = DAILY_ALLOWANCE;

  // Real-time listener (other device updates)
  balanceRef.on("value", (snap) => {
    const updated = snap.val();
    if (updated) {
      document.getElementById("balance").innerText =
        updated.currentBalance.toFixed(2);
    }
  });

  // Add spending
  window.spend = function () {
    const input = document.getElementById("spent");
    const amount = parseFloat(input.value) || 0;
    if (amount <= 0) return;

    balance -= amount;
    input.value = "";

    balanceRef.update({
      currentBalance: balance
    });
  };

  // Manual reset (optional safety)
  window.resetDay = function () {
    balance += DAILY_ALLOWANCE;
    lastUpdate = new Date().toDateString();
    balanceRef.update({
      currentBalance: balance,
      lastUpdate: lastUpdate
    });
  };
});