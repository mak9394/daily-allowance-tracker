
  });

  window.spend = function() {
    const input = document.getElementById("spent");
    const amount = parseFloat(input.value) || 0;
    if (amount <= 0) return;

    balance -= amount;
    input.value = "";

    update(balanceRef, { currentBalance: balance });

    const todayRef = ref(db, `history/${today}`);
    push(todayRef, { type: "spending", amount, time: getTime() });
    update(todayRef, { endingBalance: balance });

    renderTodayHistory();
    renderMonthlyChart();
  }

  window.resetDay = function() {
    balance += DAILY_ALLOWANCE;
    lastUpdate = getToday();
    update(balanceRef, { currentBalance: balance, lastUpdate });

    const todayRef = ref(db, `history/${getToday()}`);
    push(todayRef, { type: "allowance", amount: DAILY_ALLOWANCE, time: getTime() });
    update(todayRef, { endingBalance: balance });

    renderTodayHistory();
    renderMonthlyChart();
  }

  function renderTodayHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;
    get(ref(db, `history/${today}`)).then(snap => {
      const entries = snap.val();
      list.innerHTML = "";
      if (!entries) return;
      Object.values(entries).forEach(entry => {
        if (entry.type) {
          const li = document.createElement("li");
          li.innerText = `${entry.time} - ${entry.type}: $${entry.amount}`;
          li.className = entry.type;
          list.appendChild(li);
        }
      });
    });
  }

  function renderMonthlyChart() {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const year = new Date().getFullYear();
    const month = new Date().getMonth();

    get(historyRef).then(snap => {
      const allHistory = snap.val();
      if (!allHistory) return;

      const labels = [];
      const dataPoints = [];

      Object.keys(allHistory).sort().forEach(day => {
        const dayDate = new Date(day);
        if (dayDate.getFullYear() === year && dayDate.getMonth() === month) {
          labels.push(dayDate.getDate());
          const endingBalance = allHistory[day].endingBalance || 0;
          dataPoints.push(endingBalance);
        }
      });

      if (monthlyChart) monthlyChart.destroy();

      monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Ending Balance',
            data: dataPoints,
            backgroundColor: '#1976d2'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    });
  }

  renderTodayHistory();
  renderMonthlyChart();
});
