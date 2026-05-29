import { useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { aiService } from '../services/aiService';

/** Shared logic: open modal → call AI → dispatch result or error */
async function runBugFixCall(
  dispatch: (a: any) => void,
  fn: () => Promise<any>,
  modalMeta?: { isSelection?: boolean; selectionRange?: any; selectionText?: string },
) {
  dispatch({ type: 'OPEN_BUG_FIX_MODAL', ...modalMeta });
  try {
    const result = await fn();
    if (result?.ok) {
      dispatch({
        type: 'SET_BUG_FIX_RESULT',
        explanation: result.explanation ?? '',
        fixedCode:   result.fixedCode   ?? '',
      });
    } else {
      dispatch({
        type: 'SET_BUG_FIX_ERROR',
        error: result?.error ?? 'AI returned an unexpected response. Please try again.',
      });
    }
  } catch (err: any) {
    dispatch({ type: 'SET_BUG_FIX_ERROR', error: err.message ?? 'Unknown error.' });
  }
}

export function useAI() {
  const { state, dispatch } = useAppState();

  const analyzeCode = useCallback(async (code: string) => {
    const result = await aiService.analyze(code);
    return result;
  }, []);

  const fixError = useCallback(async (params: {
    errorMessage: string; filePath: string;
    line: number; column?: number; codeSnippet: string;
  }) => {
    await runBugFixCall(dispatch, () => aiService.fixError(params));
  }, [dispatch]);

  /** Bug Fix: scans selection if available, otherwise whole file */
  const bugFixActiveTab = useCallback(async () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;
    const selection = (window as any).__cordexGetSelection?.();
    const selectionInfo = (window as any).__cordexGetSelectionInfo?.();
    const codeToAnalyze = selection || activeTab.content;
    const isSelection = !!selection;
    await runBugFixCall(dispatch, () =>
      aiService.bugFixCode({ code: codeToAnalyze, filePath: activeTab.path, isSelection }),
      {
        isSelection,
        selectionRange: selectionInfo?.range,
        selectionText: selection,
      }
    );
  }, [state.tabs, state.activeTabId, dispatch]);

  /** Improve: refactors selection if available, otherwise whole file */
  const improveActiveTab = useCallback(async () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;
    const selection = (window as any).__cordexGetSelection?.();
    const selectionInfo = (window as any).__cordexGetSelectionInfo?.();
    const codeToAnalyze = selection || activeTab.content;
    const isSelection = !!selection;
    await runBugFixCall(dispatch, () =>
      aiService.improveCode({ code: codeToAnalyze, filePath: activeTab.path, isSelection }),
      {
        isSelection,
        selectionRange: selectionInfo?.range,
        selectionText: selection,
      }
    );
  }, [state.tabs, state.activeTabId, dispatch]);

  const generateDocstring = useCallback(async (code: string) => {
    return aiService.docstring(code);
  }, []);

  const complete = useCallback(async (prompt: string) => {
    return aiService.complete(prompt);
  }, []);

  return { analyzeCode, fixError, bugFixActiveTab, improveActiveTab, generateDocstring, complete };
}
