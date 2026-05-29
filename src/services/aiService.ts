function getAI() {
  return (window as any).Cordex?.ai;
}

export const aiService = {
  complete:    (prompt: string, model?: string, temperature?: number) =>
    getAI()?.complete({ prompt, model, temperature }),
  analyze:     (code: string, model?: string) =>
    getAI()?.analyze({ code, model }),
  abort:       (key: string) => getAI()?.abort(key),
  ping:        () => getAI()?.ping(),
  onChunk:     (cb: (chunk: string) => void) => getAI()?.onChunk(cb),
  docstring:   (code: string, model?: string) =>
    getAI()?.docstring({ code, model }),
  fixError:    (params: {
    errorMessage: string; filePath: string;
    line: number; column?: number; codeSnippet: string;
  }) => getAI()?.fixError(params),

  /** Bug Fix: scans code (selection or full file) for bugs and returns { explanation, fixedCode } */
  bugFixCode: (params: { code: string; filePath: string; isSelection?: boolean }) =>
    getAI()?.bugFixCode?.({ ...params, mode: 'bugfix' }),

  /** Improve: refactors code (selection or full file) and returns { explanation, fixedCode } */
  improveCode: (params: { code: string; filePath: string; isSelection?: boolean }) =>
    getAI()?.bugFixCode?.({ ...params, mode: 'improve' }),
};
