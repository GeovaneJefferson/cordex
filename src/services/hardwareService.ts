const api = window.Cordex?.hardware;

export const hardwareService = {
  info: () => api?.info(),
  checkModels: () => api?.checkModels(),
  onDetected: (cb: (hw: any) => void) => api?.onDetected(cb),
};