import { useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { aiService } from '../services/aiService';

export function useAI() {
  const { state, dispatch } = useAppState();

  const analyzeCode = useCallback(async (code: string) => {
    const result = await aiService.analyze(code);
    if (result?.ok && result.text) {
      console.log('[AI] Analysis result:', result.text);
    }
    return result;
  }, []);

  const fixError = useCallback(async (params: {
    errorMessage: string;
    filePath: string;
    line: number;
    column?: number;
    codeSnippet: string;
  }) => {
    dispatch({ type: 'OPEN_BUG_FIX_MODAL' });

    const result = await aiService.fixError(params);

    if (result?.ok) {
      dispatch({
        type: 'SET_BUG_FIX_RESULT',
        fixedCode: result.fixedCode ?? '',
        explanation: result.explanation ?? '',
      });
    } else {
      dispatch({ type: 'SET_BUG_FIX_LOADING', loading: false });
      console.error('[AI] fixError failed:', result?.error);
    }

    return result;
  }, [dispatch]);

  const bugFixActiveTab = useCallback(async () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;

    dispatch({ type: 'OPEN_BUG_FIX_MODAL' });

    const result = await aiService.analyze(activeTab.content);
    if (result?.ok && result.text) {
      dispatch({
        type: 'SET_BUG_FIX_RESULT',
        fixedCode: activeTab.content,
        explanation: result.text,
      });
    } else {
      dispatch({ type: 'SET_BUG_FIX_LOADING', loading: false });
    }
  }, [state.tabs, state.activeTabId, dispatch]);

  const generateDocstring = useCallback(async (code: string) => {
    return aiService.docstring(code);
  }, []);

  const complete = useCallback(async (prompt: string) => {
    return aiService.complete(prompt);
  }, []);

  return { analyzeCode, fixError, bugFixActiveTab, generateDocstring, complete };
}
