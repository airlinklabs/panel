/**
 * Performance Metrics Tracking
 * Handles measuring and displaying API response times
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a page with the performance metrics element
    const latencyElement = document.getElementById('apiLatency');
    const latencyBar = document.getElementById('latencyBar');
    
    if (latencyElement && latencyBar) {
        // Initial state
        updateLatencyUI('--', 0);
        
        // Start measuring API response time
        measureApiLatency();
        
        // Update every 30 seconds
        setInterval(measureApiLatency, 30000);
    }
});

/**
 * Measures the response time of the API by sending a GET request to the `/api/v1/ping` endpoint and updates the latency display UI.
 *
 * On success, updates the UI with the measured latency in milliseconds. On failure, displays an error status and resets the progress bar.
 */
async function measureApiLatency() {
    const startTime = performance.now();
    const endpoint = '/api/v1/ping'; // Using a lightweight endpoint
    
    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        // Update UI with the new latency
        updateLatencyUI(latency, latency);
        
    } catch (error) {
        console.error('Error measuring API latency:', error);
        updateLatencyUI('ERR', 0);
    }
}

/**
 * Updates the displayed API latency and adjusts the progress bar to reflect the current response time.
 * 
 * If the required UI elements are missing, the function exits without making changes. The progress bar's width and color indicate the latency range, with green for low latency, yellow for moderate, and red for high latency.
 * 
 * @param {number|string} latency - The latency value in milliseconds or a status text to display.
 * @param {number} latencyMs - The numeric latency in milliseconds used to determine the progress bar's width and color.
 */
function updateLatencyUI(latency, latencyMs) {
    const latencyElement = document.getElementById('apiLatency');
    const latencyBar = document.getElementById('latencyBar');
    
    if (!latencyElement || !latencyBar) return;
    
    // Update the text
    latencyElement.textContent = typeof latency === 'number' ? `${latency} ms` : latency;
    
    // Update the progress bar (scale 0-1000ms to 0-100%)
    const percentage = Math.min(100, Math.max(0, (latencyMs / 1000) * 100));
    
    // Set the width and color based on latency
    latencyBar.style.width = `${percentage}%`;
    
    // Change color based on latency
    if (latencyMs < 200) {
        latencyBar.className = 'h-2.5 rounded-full transition-all duration-300 bg-green-500';
    } else if (latencyMs < 500) {
        latencyBar.className = 'h-2.5 rounded-full transition-all duration-300 bg-yellow-500';
    } else {
        latencyBar.className = 'h-2.5 rounded-full transition-all duration-300 bg-red-500';
    }
}

// Make the function available globally if needed
window.measureApiLatency = measureApiLatency;
