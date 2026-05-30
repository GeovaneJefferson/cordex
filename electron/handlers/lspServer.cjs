// electron/utils/lspServer.cjs
const { spawn } = require('child_process');
const WebSocket = require('ws');

let pyrightProc = null;
let wsServer = null;

function startLspForProject(projectRoot, webContentsId) {
  if (wsServer) return;

  const port = 6007;
  wsServer = new WebSocket.Server({ port });

  wsServer.on('connection', (socket) => {
    console.log('[LSP] Renderer connected');

    if (!pyrightProc) {
      // Spawn pyright-langserver with the project root as the working directory
      pyrightProc = spawn('pyright-langserver', ['--stdio'], { cwd: projectRoot });
      console.log(`[LSP] Spawned pyright-langserver in ${projectRoot}`);

      pyrightProc.stdout.on('data', (data) => {
        const msg = data.toString();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(msg);
        }
      });

      pyrightProc.stderr.on('data', (data) => {
        console.error('[pyright stderr]', data.toString());
      });

      pyrightProc.on('close', () => {
        console.log('[LSP] pyright exited');
        pyrightProc = null;
      });
    }

    socket.on('message', (data) => {
      if (pyrightProc && pyrightProc.stdin.writable) {
        pyrightProc.stdin.write(data.toString());
      }
    });

    socket.on('close', () => {
      console.log('[LSP] Renderer disconnected');
      // Keep pyright running for next connection
    });
  });

  wsServer.on('error', (err) => console.error('[LSP Server error]', err));
  console.log(`[LSP] WebSocket server listening on ws://localhost:${port}`);
}

function stopLspForProject() {
  if (pyrightProc) {
    pyrightProc.kill();
    pyrightProc = null;
  }
  if (wsServer) {
    wsServer.close();
    wsServer = null;
  }
  console.log('[LSP] Server stopped');
}

module.exports = { startLspForProject, stopLspForProject };