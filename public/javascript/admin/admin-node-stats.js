(function() {
  const stats = JSON.parse(document.getElementById('page-data').dataset.stats || '[]');

  function parseRam(ramString) {
    return parseFloat(ramString.replace(' MB', ''));
  }

  function parseCpu(cpuString) {
    return parseFloat(cpuString.replace('%', ''));
  }

  const ramTimestamps = stats.length ? stats.map(stat => new Date(stat.timestamp).toLocaleTimeString()) : ['0:00', '0:00', '0:00'];
  const ramData = stats.length ? stats.map(stat => parseRam(stat.Ram)) : [0, 0, 0];
  const ramMax = stats.length ? Math.max(...ramData, parseRam(stats[0].RamMax)) : 1;

  const ctxRam = document.getElementById('ramChart').getContext('2d');
  const ramChart = new Chart(ctxRam, {
    type: 'line',
    data: {
      labels: ramTimestamps,
      datasets: [{
        label: 'RAM Usage (MB)',
        data: ramData,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#FFFFFF' } }
      },
      scales: {
        x: { ticks: { color: '#FFFFFF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
        y: { suggestedMax: ramMax, beginAtZero: true, ticks: { color: '#FFFFFF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
      }
    }
  });

  const cpuData = stats.length ? stats.map(stat => parseCpu(stat.Cores)) : [0, 0, 0];
  const cpuMax = 100;

  const ctxCpu = document.getElementById('cpuChart').getContext('2d');
  const cpuChart = new Chart(ctxCpu, {
    type: 'line',
    data: {
      labels: ramTimestamps,
      datasets: [{
        label: 'CPU Usage (%)',
        data: cpuData,
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#FFFFFF' } }
      },
      scales: {
        x: { ticks: { color: '#FFFFFF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
        y: { suggestedMax: cpuMax, beginAtZero: true, ticks: { color: '#FFFFFF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
      }
    }
  });
})();
