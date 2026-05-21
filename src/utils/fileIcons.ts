export interface FileIconInfo {
    icon: string;       // Material Symbols icon name
    color: string;      // Tailwind color class
}

const iconMap: Record<string, FileIconInfo> = {
    ts:         { icon: 'javascript',       color: 'text-blue-500' },
    tsx:        { icon: 'javascript',       color: 'text-blue-400' },
    js:         { icon: 'javascript',       color: 'text-yellow-500' },
    jsx:        { icon: 'javascript',       color: 'text-yellow-400' },
    py:         { icon: 'terminal',         color: 'text-green-600' },
    pyx:        { icon: 'terminal',         color: 'text-green-600' },
    pyi:        { icon: 'terminal',         color: 'text-green-600' },
    rs:         { icon: 'code',             color: 'text-orange-600' },
    go:         { icon: 'code',             color: 'text-cyan-600' },
    java:       { icon: 'coffee',           color: 'text-red-600' },
    c:          { icon: 'code',             color: 'text-blue-600' },
    cpp:        { icon: 'code',             color: 'text-blue-600' },
    h:          { icon: 'code',             color: 'text-blue-600' },
    hpp:        { icon: 'code',             color: 'text-blue-600' },
    css:        { icon: 'css',              color: 'text-blue-400' },
    scss:       { icon: 'css',              color: 'text-pink-400' },
    less:       { icon: 'css',              color: 'text-blue-300' },
    html:       { icon: 'html',             color: 'text-orange-500' },
    json:       { icon: 'settings',         color: 'text-yellow-600' },
    md:         { icon: 'description',      color: 'text-blue-400' },
    markdown:   { icon: 'description',      color: 'text-blue-400' },
    sh:         { icon: 'terminal',         color: 'text-gray-600' },
    bash:       { icon: 'terminal',         color: 'text-gray-600' },
    yml:        { icon: 'settings',         color: 'text-red-500' },
    yaml:       { icon: 'settings',         color: 'text-red-500' },
    toml:       { icon: 'settings',         color: 'text-gray-500' },
    lua:        { icon: 'code',             color: 'text-blue-500' },
    sql:        { icon: 'storage',          color: 'text-blue-500' },
    graphql:    { icon: 'hub',              color: 'text-pink-500' },
    vue:        { icon: 'code',             color: 'text-green-500' },
    svelte:     { icon: 'code',             color: 'text-orange-500' },
    // defaults for folders handled separately
};

export function getFileIcon(filename: string): FileIconInfo {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return iconMap[ext] || { icon: 'description', color: 'text-gray-400' };
}

export function detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', pyx: 'python', pyi: 'python', rs: 'rust', go: 'go',
        java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
        css: 'css', scss: 'scss', less: 'less', html: 'html',
        json: 'json', md: 'markdown', markdown: 'markdown',
        sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml',
        toml: 'toml', lua: 'lua', sql: 'sql', graphql: 'graphql',
        vue: 'vue', svelte: 'svelte',
    };
    return langMap[ext] || 'plaintext';
}
