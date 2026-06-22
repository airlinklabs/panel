const ctx = document.getElementById('playerChart').getContext('2d');
const playerChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Total Players',
      data: [],
      backgroundColor: 'rgba(163, 163, 163, 0.2)',
      borderColor: 'rgba(163, 163, 163, 1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointBackgroundColor: 'rgba(163, 163, 163, 1)',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(163, 163, 163, 1)',
      pointHoverBorderWidth: 2
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#FFFFFF'
        }
      },
      tooltip: {
        callbacks: {
          title: function(tooltipItems) {
            return new Date(tooltipItems[0].label).toLocaleString();
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#FFFFFF',
          maxRotation: 45,
          minRotation: 45,
          callback: function(value, index, values) {
            if (index % 12 === 0) {
              const date = new Date(this.getLabelForValue(value));
              return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return '';
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        position: 'right',
        beginAtZero: true,
        ticks: {
          color: '#FFFFFF',
          padding: 10,
          font: {
            weight: 'bold'
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        title: {
          display: true,
          text: 'Players',
          color: '#FFFFFF',
          font: {
            size: 12
          }
        }
      }
    }
  }
});

async function fetchPlayerData() {
  try {
    const response = await fetch('/api/admin/playerstats');
    const data = await response.json();

    if (data.error) {
      console.error('Error fetching player data:', data.error);
      return;
    }

    document.getElementById('totalPlayers').textContent = data.totalPlayers;
    document.getElementById('maxCapacity').textContent = data.totalMaxPlayers;
    document.getElementById('onlineServers').textContent = data.onlineServers;

    const utilizationPercent = data.totalMaxPlayers > 0
      ? Math.round((data.totalPlayers / data.totalMaxPlayers) * 100)
      : 0;
    document.getElementById('utilization').textContent = `${utilizationPercent}%`;

    const tableBody = document.getElementById('serverTableBody');
    tableBody.innerHTML = '';

    if (data.servers.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="4" class="px-6 py-4 text-center text-neutral-400">No servers found</td>`;
      tableBody.appendChild(row);
    } else {
      data.servers.forEach(server => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors';

        const statusClass = server.online ? 'text-emerald-700 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30' : 'text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/30 border border-neutral-300 dark:border-neutral-700/30';
        const statusText = server.online ? 'Online' : 'Offline';

        row.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <div class="ml-4">
                <div class="text-sm font-medium text-neutral-800 dark:text-white">${server.serverName}</div>
                <div class="text-sm text-neutral-400">${server.serverId}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
              ${statusText}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-700 dark:text-white">
            ${server.playerCount} / ${server.maxPlayers}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-neutral-400">
            ${server.version || 'Unknown'}
          </td>
        `;

        tableBody.appendChild(row);
      });
    }

    if (data.historicalData && data.historicalData.length > 0) {
      const labels = data.historicalData.map(entry => new Date(entry.timestamp).toISOString());
      const playerCounts = data.historicalData.map(entry => entry.totalPlayers);

      labels.push(new Date().toISOString());
      playerCounts.push(data.totalPlayers);

      playerChart.data.labels = labels;
      playerChart.data.datasets[0].data = playerCounts;
      playerChart.update();
    } else {
      const now = new Date().toISOString();

      playerChart.data.labels = [now];
      playerChart.data.datasets[0].data = [data.totalPlayers];
      playerChart.update();
    }

  } catch (error) {
    console.error('Error fetching player data:', error);
  }
}

fetchPlayerData();

const refreshInterval = setInterval(fetchPlayerData, 300000);

document.getElementById('refreshBtn').addEventListener('click', fetchPlayerData);

async function triggerDataCollection() {
  try {
    const response = await fetch('/api/admin/playerstats/collect', {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      console.log('Player statistics collected successfully');
      setTimeout(fetchPlayerData, 1000);
    } else {
      console.error('Error collecting player statistics:', data.error);
    }
  } catch (error) {
    console.error('Error triggering data collection:', error);
  }
}

document.getElementById('refreshBtn').addEventListener('dblclick', (e) => {
  e.preventDefault();
  triggerDataCollection();
});

window.addEventListener('beforeunload', () => {
  clearInterval(refreshInterval);
});
