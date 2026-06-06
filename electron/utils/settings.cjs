'use strict'
const path = require('path')
const fs   = require('fs-extra')
const { app } = require('electron')

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS = {
  fontSize: 13,
  autocompleteModel: 'qwen2.5-coder:1.5b-base',
  analysisModel:     'qwen2.5-coder:7b',
  embedModel:        'qwen3-embedding:0.6b',
  flowModel:         'qwen2.5-coder:7b',
  agentDocModel:     'qwen2.5-coder:7b', 
  agentFixModel:     'qwen2.5-coder:7b', 
}

let cachedSettings = null

function loadSettings() {
  if (cachedSettings) return { ...cachedSettings }
  try {
    cachedSettings = { ...DEFAULT_SETTINGS, ...fs.readJsonSync(SETTINGS_PATH) }
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS }
  }
  return { ...cachedSettings }
}

function saveSettings(settings) {
  fs.outputJsonSync(SETTINGS_PATH, settings, { spaces: 2 })
  cachedSettings = { ...settings }
}

module.exports = { loadSettings, saveSettings, DEFAULT_SETTINGS }