const api = window.Cordex?.ai;
export const aiService = {
  complete: (prompt: string, model?: string, temperature?: number) =>
    api?.complete({ prompt, model, temperature }),
  analyze: (code: string, model?: string) =>
    api?.analyze({ code, model }),
  abort: (key: string) => api?.abort(key),
  ping: () => api?.ping(),
  onChunk: (cb: (chunk: string) => void) => api?.onChunk(cb),
  docstring: (code: string, model?: string) =>
    api?.docstring({ code, model }),
  fixError: (params: {
    errorMessage: string;
    filePath: string;
    line: number;
    column?: number;
    codeSnippet: string;
  }) => api?.fixError(params),
};