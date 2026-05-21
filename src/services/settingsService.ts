const api = window.Cordex?.settings;

export const settingsService = {
    get: () => api?.get(),
    set: (updates: Record<string, any>) => api?.set(updates),
};
