const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// All user-editable defaults in one place
const DEFAULT_SETTINGS = {
  fontSize: 13,
  autocompleteModel: 'qwen2.5-coder:1.5b-base',
  analysisModel: 'qwen2.5-coder:3b',
  embedModel: 'nomic-embed-text',
  flowModel: 'cordex-flow',
  theme: 'white',                
  showLineNumbers: true,        
  // add more as needed
};

function loadSettings() {
  try {
    const saved = fs.readJsonSync(SETTINGS_PATH);
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 });
}

function getSetting(key) {
  const all = loadSettings();
  return all[key];
}

function setSetting(key, value) {
  const all = loadSettings();
  all[key] = value;
  saveSettings(all);
  return all;
}

function resetToDefaults() {
  saveSettings({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

module.exports = {
  loadSettings,
  saveSettings,
  getSetting,
  setSetting,
  resetToDefaults,
  DEFAULT_SETTINGS,
};