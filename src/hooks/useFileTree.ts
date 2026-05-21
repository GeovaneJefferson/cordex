import { useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { fsService } from '../services/fsService';
import { detectLanguage } from '../utils/fileIcons';

const Cordex = (window as any).Cordex;

export function useFileTree() {
  const { state, dispatch } = useAppState();

  const openProject = useCallback(async () => {
    const dir = await fsService.openProject();
    if (!dir) return;
    (window as any).__cordexRoot = dir;
    const result = await fsService.readDir(dir);
    if (result?.ok && result.tree) {
      dispatch({ type: 'SET_PROJECT', root: dir, tree: result.tree });
    }
  }, [dispatch]);

  const readFile = useCallback(async (filePath: string, intoSplit = false) => {
    const result = await fsService.readFile(filePath);
    if (result?.ok) {
      const name = filePath.split('/').pop()!;
      const language = detectLanguage(name);
      const tab = {
        id: filePath,
        path: filePath,
        name,
        content: result.content ?? '',
        language,
        isDirty: false,
      };
      dispatch({ type: 'ADD_TAB', tab });
      if (intoSplit) dispatch({ type: 'SET_SPLIT_TAB', tabId: filePath });
    }
  }, [dispatch]);

  const refreshTree = useCallback(async () => {
    const root = state.projectRoot || (window as any).__cordexRoot;
    if (!root) return;
    const result = await Cordex?.fs?.readDir?.(root);
    if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
  }, [state.projectRoot, dispatch]);

  // Keep global refs for context menu access
  (window as any).__cordexRoot = state.projectRoot;
  (window as any).__cordexTabs = state.tabs;

  return { openProject, readFile, refreshTree, projectRoot: state.projectRoot, fileTree: state.fileTree };
}
