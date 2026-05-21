const api = window.Cordex?.fs;
export const fsService = {
  openProject: () => api?.openProject(),
  readDir: (dir: string) => api?.readDir(dir),
  readFile: (path: string) => api?.readFile(path),
  writeFile: (path: string, content: string) => api?.writeFile(path, content),
  createFile: (dir: string, name: string) => api?.createFile(dir, name),
  createFolder: (dir: string, name: string) => api?.createFolder(dir, name),
  rename: (oldPath: string, newName: string) => api?.rename(oldPath, newName),
  delete: (path: string) => api?.delete(path),
  move: (src: string, destDir: string) => api?.move(src, destDir),
  watch: (dir: string) => api?.watch(dir),
  stopWatch: () => api?.stopWatch(),
  onChange: (cb: (ev: any) => void) => api?.onChange(cb),
};