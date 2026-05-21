'use strict'
const { execSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

/**
 * Full GPU detection for llama.cpp backend selection.
 * Handles: NVIDIA CUDA, AMD ROCm/HIP/Vulkan (including RDNA1 HSA override),
 * Apple Metal, Intel Vulkan, CPU fallback.
 */
async function detectGPU() {
  const platform = process.platform
  if (platform === 'darwin') return detectApple()
  const { vendor, name, vramMB } = detectVendorAndVRAM(platform)
  if (vendor === 'nvidia') return detectNVIDIA(name, vramMB)
  if (vendor === 'amd')    return detectAMD(name, vramMB, platform)
  if (vendor === 'intel')  return detectIntel(name, vramMB)
  return cpuFallback('No discrete GPU detected')
}

// ── Apple Metal ───────────────────────────────────────────────────────────────
function detectApple() {
  const totalGB = os.totalmem() / (1024 ** 3)
  try {
    const out  = execSync('system_profiler SPHardwareDataType -json', { encoding: 'utf8', timeout: 5000 })
    const chip = JSON.parse(out)?.SPHardwareDataType?.[0]?.chip_type ?? ''
    if (/apple m/i.test(chip)) {
      const vramMB = Math.round(totalGB * 0.7 * 1024)
      const layers = layersForVRAM(vramMB, 'metal')
      return result('apple', chip, vramMB, 'metal', layers,
        `Apple Silicon ${chip} — Metal backend, ~${Math.round(totalGB * 0.7)}GB unified`)
    }
  } catch {}
  return cpuFallback('Intel Mac — CPU fallback')
}

// ── Vendor + VRAM detection ───────────────────────────────────────────────────
function detectVendorAndVRAM(platform) {
  let vendor = 'none', name = '', vramMB = 0
  if (platform === 'linux') {
    const lspci = run('lspci -mm')
    if (lspci) {
      for (const line of lspci.split('\n')) {
        const lo = line.toLowerCase()
        if (!lo.includes('vga') && !lo.includes('3d') && !lo.includes('display')) continue
        if (lo.includes('nvidia'))                                   { vendor='nvidia'; name=quoted(line); break }
        if (lo.includes('advanced micro') || lo.includes('radeon')) { vendor='amd';    name=quoted(line); break }
        if (lo.includes('intel'))                                    { vendor='intel';  name=quoted(line); break }
      }
    }
    if (vendor === 'nvidia') vramMB = parseInt(run('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits') ?? '0', 10) || 0
    if (vendor === 'amd')    vramMB = readAMDVRAMLinux()
  } else if (platform === 'win32') {
    const raw = run('powershell -NoProfile -command "Get-CimInstance Win32_VideoController | Select Name,AdapterRAM | ConvertTo-Json"')
    if (raw) {
      const arr = [].concat(safeJSON(raw))
      for (const a of arr) {
        const n = (a?.Name ?? '').toLowerCase()
        const mb = Math.round((a?.AdapterRAM ?? 0) / (1024 ** 2))
        if (n.includes('nvidia'))                    { vendor='nvidia'; name=a.Name; vramMB=mb; break }
        if (n.includes('amd') || n.includes('radeon')) { vendor='amd';  name=a.Name; vramMB=mb; break }
        if (n.includes('intel'))                     { vendor='intel';  name=a.Name; vramMB=mb }
      }
    }
  }
  return { vendor, name, vramMB }
}

function readAMDVRAMLinux() {
  try {
    const drm = '/sys/class/drm'
    const cards = fs.readdirSync(drm).filter(d => /^card\d+$/.test(d))
    let best = 0
    for (const card of cards) {
      try {
        const bytes = parseInt(fs.readFileSync(path.join(drm, card, 'device', 'mem_info_vram_total'), 'utf8').trim(), 10)
        const mb = Math.round(bytes / (1024**2))
        if (mb > best) best = mb
      } catch {}
    }
    if (best > 0) return best
  } catch {}
  return 0
}

// ── NVIDIA ────────────────────────────────────────────────────────────────────
function detectNVIDIA(name, vramMB) {
  const smiOK = !!run('nvidia-smi')
  if (!smiOK) return result('nvidia', name, vramMB, 'cpu', 0, 'NVIDIA GPU — driver not installed')
  const cudaVer = (run('nvcc --version') ?? '').match(/release\s+([\d.]+)/)?.[1] ?? null
  const vulkan  = hasVulkan()
  const backend = cudaVer ? 'cuda' : vulkan ? 'vulkan' : 'cpu'
  const vram    = vramMB || 4096
  const layers  = backend !== 'cpu' ? layersForVRAM(vram, backend) : 0
  return result('nvidia', name || 'NVIDIA GPU', vram, backend, layers,
    cudaVer  ? `NVIDIA CUDA ${cudaVer} — ${vram}MB VRAM, ${layers} layers`
    : vulkan ? `NVIDIA GPU — Vulkan fallback, ${vram}MB VRAM, ${layers} layers`
             : 'NVIDIA GPU — no CUDA/Vulkan, CPU fallback', cudaVer, null)
}

// ── AMD — full RDNA1/2/3 detection with HSA override ─────────────────────────
function detectAMD(name, vramMB, platform) {
  const vram = vramMB || 8192  // RX 5700 XT default if /sys read fails

  if (platform !== 'linux') {
    const vulkan = hasVulkan()
    const layers = vulkan ? layersForVRAM(vram, 'vulkan') : 0
    return result('amd', name || 'AMD GPU', vram,
      vulkan ? 'vulkan' : 'cpu', layers,
      vulkan ? `AMD GPU — Vulkan, ${vram}MB VRAM, ${layers} layers`
             : 'AMD GPU — no Vulkan on Windows, CPU fallback')
  }

  // ── Detect GPU architecture for HSA override ──────────────────────────────
  const archInfo = detectAMDArch()
  const rocmVersion = detectROCm()
  const vulkan = hasVulkan()

  // Build env overrides needed for this specific GPU
  const envOverrides = {}
  if (archInfo.needsHsaOverride) {
    envOverrides['HSA_OVERRIDE_GFX_VERSION'] = archInfo.hsaOverride
  }

  const backend = rocmVersion ? 'rocm' : vulkan ? 'vulkan' : 'cpu'
  const layers  = backend !== 'cpu' ? layersForVRAM(vram, backend) : 0

  let reason
  if (backend === 'rocm') {
    reason = `AMD ROCm ${rocmVersion} (${archInfo.arch ?? 'unknown arch'}) — ${vram}MB VRAM, ${layers} layers`
    if (archInfo.needsHsaOverride) reason += ` — HSA_OVERRIDE_GFX_VERSION=${archInfo.hsaOverride} applied (RDNA1)`
  } else if (backend === 'vulkan') {
    reason = `AMD GPU — ROCm not found, Vulkan fallback, ${vram}MB VRAM, ${layers} layers`
  } else {
    reason = 'AMD GPU — ROCm/Vulkan unavailable, CPU fallback. Install ROCm or build llama.cpp with HIP.'
  }

  return result('amd', name || 'AMD GPU', vram, backend, layers, reason, null, rocmVersion, envOverrides)
}

// ── AMD architecture detection (for HSA override) ─────────────────────────────
function detectAMDArch() {
  let arch = null
  let needsHsaOverride = false
  let hsaOverride = null

  try {
    // rocminfo is most reliable
    const rocminfo = run('rocminfo 2>/dev/null') || run('/opt/rocm/bin/rocminfo 2>/dev/null')
    if (rocminfo) {
      // Look for "gfxXXXX" in the ISA entry
      const m = rocminfo.match(/ISA:\s*amdgcn-amd-amdhsa--([a-z0-9]+)/i)
             || rocminfo.match(/Name:\s+(gfx[0-9]+[a-z]?)/i)
      if (m) arch = m[1].toLowerCase()
    }
  } catch {}

  if (!arch) {
    // Fallback: check /sys for GPU product name and guess arch
    try {
      const vendor = fs.readFileSync('/sys/class/drm/card0/device/vendor', 'utf8').trim()
      if (vendor === '0x1002') { // AMD
        const devid = fs.readFileSync('/sys/class/drm/card0/device/device', 'utf8').trim()
        arch = guessArchFromDeviceId(devid)
      }
    } catch {}
  }

  if (arch) {
    // RDNA 1: gfx1010, gfx1011, gfx1012 — needs HSA_OVERRIDE_GFX_VERSION=10.3.0
    if (/^gfx101[012]$/.test(arch)) {
      needsHsaOverride = true
      hsaOverride = '10.3.0'
    }
    // RDNA 2: gfx1030–gfx1036 — no override needed
    // RDNA 3: gfx1100+ — no override needed
    // GCN4/Vega: gfx900, gfx906 — ROCm native support
  }

  return { arch, needsHsaOverride, hsaOverride }
}

// Map known AMD device IDs to GFX architecture
function guessArchFromDeviceId(devid) {
  const id = parseInt(devid, 16)
  // RX 5700 XT = 0x731F = gfx1010 (RDNA 1)
  if (id >= 0x7310 && id <= 0x7340) return 'gfx1010'
  // RX 6xxx = RDNA 2
  if (id >= 0x73A0 && id <= 0x73FF) return 'gfx1030'
  // RX 7xxx = RDNA 3
  if (id >= 0x7440 && id <= 0x74FF) return 'gfx1100'
  return null
}

// ── ROCm detection ────────────────────────────────────────────────────────────
function detectROCm() {
  // /dev/kfd = amdkfd kernel module loaded = ROCm runtime present
  try {
    if (fs.existsSync('/dev/kfd')) {
      const v = run('cat /opt/rocm/.info/version')
             || run('rocm-smi --version')
             || run('/opt/rocm/bin/rocm-smi --version')
      const m = (v ?? '').match(/[\d]+\.[\d]+/)
      return m ? m[0] : 'detected'
    }
  } catch {}
  // rocminfo agent enumeration
  const rocminfo = run('rocminfo 2>/dev/null') || run('/opt/rocm/bin/rocminfo 2>/dev/null')
  if (rocminfo?.includes('Agent')) {
    const m = rocminfo.match(/Runtime Version:\s*([\d.]+)/)
    return m ? m[1] : 'detected'
  }
  // hipconfig
  const hip = run('hipconfig --version') || run('/opt/rocm/bin/hipconfig --version')
  if (hip) { const m = hip.match(/[\d.]+/); if (m) return m[0] }
  // shared libs
  const ld = run('ldconfig -p')
  if (ld && (ld.includes('libamdhip64') || ld.includes('librocm'))) return 'detected'
  // /opt/rocm exists
  try { if (fs.existsSync('/opt/rocm/lib')) return 'detected' } catch {}
  return null
}

// ── Vulkan detection ──────────────────────────────────────────────────────────
function hasVulkan() {
  if (process.platform === 'win32') return true
  // ICD files
  const icdDirs = [
    '/usr/share/vulkan/icd.d', '/etc/vulkan/icd.d',
    '/usr/local/share/vulkan/icd.d',
  ]
  for (const d of icdDirs) {
    try { if (fs.readdirSync(d).length > 0) return true } catch {}
  }
  // Fedora RADV (Mesa) specific paths
  const radv = [
    '/usr/share/vulkan/icd.d/radeon_icd.x86_64.json',
    '/usr/share/vulkan/icd.d/amd_icd64.json',
    '/usr/share/vulkan/icd.d/intel_icd.x86_64.json',
  ]
  for (const p of radv) { try { if (fs.existsSync(p)) return true } catch {} }
  // ldconfig
  const ld = run('ldconfig -p')
  if (ld?.includes('libvulkan')) return true
  // renderD128 = any GPU with DRM render node (modern Mesa always supports Vulkan)
  try { if (fs.existsSync('/dev/dri/renderD128')) return true } catch {}
  return false
}

// ── Intel ─────────────────────────────────────────────────────────────────────
function detectIntel(name, vramMB) {
  const vulkan = hasVulkan()
  const vram   = vramMB || 2048
  const layers = vulkan ? layersForVRAM(vram, 'vulkan') : 0
  return result('intel', name || 'Intel GPU', vram,
    vulkan ? 'vulkan' : 'cpu', layers,
    vulkan ? `Intel GPU — Vulkan, ${vram}MB, ${layers} layers` : 'Intel GPU — CPU fallback')
}

// ── GPU layers recommendation ─────────────────────────────────────────────────
function layersForVRAM(vramMB, backend) {
  if (backend === 'metal') {
    if (vramMB >= 16384) return 99
    if (vramMB >= 8192)  return 40
    if (vramMB >= 4096)  return 20
    return 12
  }
  if (vramMB >= 24000) return 99
  if (vramMB >= 16000) return 99
  if (vramMB >= 8000)  return 33   // RX 5700 XT 8GB
  if (vramMB >= 6000)  return 28
  if (vramMB >= 4000)  return 20
  if (vramMB >= 2000)  return 10
  return 5
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function result(vendor, name, vramMB, backend, layers, reason,
                cudaVersion = null, rocmVersion = null, envOverrides = {}) {
  return {
    vendor, name, vramMB, backend, layers, reason,
    supported: backend !== 'cpu',
    cudaVersion, rocmVersion, envOverrides,
    backendFlags: backend !== 'cpu' ? ['-ngl', String(layers)] : [],
  }
}
function cpuFallback(reason) { return result('none', 'CPU', 0, 'cpu', 0, reason) }
function run(cmd) {
  try { return execSync(cmd + ' 2>/dev/null', { encoding:'utf8', timeout:5000, shell:true }).trim() || null }
  catch { return null }
}
function safeJSON(s) { try { return JSON.parse(s) } catch { return {} } }
function quoted(line) {
  const m = line.match(/"([^"]+)"/g)
  return m?.[1]?.replace(/"/g,'') ?? line.trim()
}

module.exports = { detectGPU, layersForVRAM, detectAMDArch }
