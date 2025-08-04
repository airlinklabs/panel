const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RadarMonitor {
  constructor() {
    this.config = this.loadConfig();
    this.threatsDetected = [];
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, 'enhanced_config.json');
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error('Error loading config:', error);
      process.exit(1);
    }
  }

  async scanDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!this.isExcluded(fullPath)) {
            await this.scanDirectory(fullPath);
          }
        } else {
          await this.analyzeFile(fullPath, stat);
        }
      }
    } catch (error) {
      console.error(`Error scanning ${dir}:`, error);
    }
  }

  isExcluded(filePath) {
    return this.config.exclusions.paths.some(pattern => 
      filePath.includes(pattern.replace('**', ''))
    ) || this.config.exclusions.extensions.some(ext => 
      filePath.endsWith(ext)
    );
  }

  async analyzeFile(filePath, stats) {
    try {
      // Check file size
      if (stats.size > this.config.settings.max_file_size_mb * 1024 * 1024) {
        this.logThreat('SUSPICIOUS_SIZE', filePath, `File size exceeds ${this.config.settings.max_file_size_mb}MB`);
        return;
      }

      // Check file content for threats
      const content = fs.readFileSync(filePath, 'utf8');
      if (this.detectMaliciousContent(content, filePath)) {
        this.logThreat('MALICIOUS_CONTENT', filePath, 'Contains known malicious patterns');
      }

    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error);
    }
  }

  detectMaliciousContent(content, filePath) {
    const patterns = [
      { name: 'SHELL_SCRIPT', regex: /(bash -i|wget.*-O|curl.*\|\s*bash)/i },
      { name: 'CRYPTO_MINER', regex: /(xmrig|ethminer|cgminer|minerd|stratum)/i },
      { name: 'MALICIOUS_JS', regex: /(eval\(|Function\(|atob\(|document\.cookie)/i },
      { name: 'SUSPICIOUS_IP', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ }
    ];

    return patterns.some(pattern => {
      if (pattern.regex.test(content)) {
        this.logThreat(pattern.name, filePath, `Matched ${pattern.name} pattern`);
        return true;
      }
      return false;
    });
  }

  logThreat(type, filePath, details) {
    const threat = {
      timestamp: new Date().toISOString(),
      type,
      file: filePath,
      details,
      action: 'quarantined'
    };

    this.threatsDetected.push(threat);
    console.log(`[THREAT DETECTED] ${JSON.stringify(threat)}`);
    
    if (this.config.response.quarantine_malicious) {
      this.quarantineFile(filePath);
    }
  }

  quarantineFile(filePath) {
    try {
      const quarantineDir = path.join(__dirname, 'quarantine');
      if (!fs.existsSync(quarantineDir)) {
        fs.mkdirSync(quarantineDir, { recursive: true });
      }
      
      const fileName = path.basename(filePath);
      const quarantinePath = path.join(quarantineDir, `${Date.now()}_${fileName}`);
      
      fs.renameSync(filePath, quarantinePath);
      console.log(`[QUARANTINED] Moved ${filePath} to ${quarantinePath}`);
    } catch (error) {
      console.error(`Error quarantining file ${filePath}:`, error);
    }
  }

  async startMonitoring() {
    console.log('Starting enhanced radar monitoring...');
    setInterval(async () => {
      console.log('Running scheduled scan...');
      await this.scanDirectory('/'); // Adjust the starting directory as needed
      console.log(`Scan completed. Threats detected: ${this.threatsDetected.length}`);
    }, this.config.settings.scan_interval * 1000);
  }
}

// Start the monitor
const monitor = new RadarMonitor();
monitor.startMonitoring().catch(console.error);
