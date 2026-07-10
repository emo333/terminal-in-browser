// Simple JS Bash‑like terminal with mock filesystem
const term = document.getElementById('terminal');
let cwd = '/home/user'; // start in home directory
// Mock filesystem structure (directories and files)
const fs = {
  '/': {type: 'dir', children: {}},
};
function initFs() {
  // create basic hierarchy
  const root = fs['/'];
  function addDir(path) {
    const parts = path.split('/').filter(Boolean);
    let cur = root;
    for (const p of parts) {
      if (!cur.children[p]) cur.children[p] = {type: 'dir', children: {}};
      cur = cur.children[p];
    }
  }
  addDir('/home');
  addDir('/home/user');
}
initFs();
function resolvePath(p) {
  if (!p) return cwd;
  if (p.startsWith('/')) return p.replace(/\/+/g, '/');
  const combined = `${cwd}/${p}`.replace(/\/+/g, '/');
  // simplify .. and .
  const parts = [];
  for (const seg of combined.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length) parts.pop(); }
    else parts.push(seg);
  }
  return '/' + parts.join('/') || '/';
}
function getNode(path) {
  const clean = resolvePath(path);
  const parts = clean.split('/').filter(Boolean);
  let node = fs['/'];
  for (const p of parts) {
    if (!node.children[p]) return null;
    node = node.children[p];
  }
  return {node, path: clean};
}
function writeLine(html) {
  const line = document.createElement('div');
  line.innerHTML = html;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}
function prompt() {
  const line = document.createElement('div');
  line.className = 'input-line';
  const promptSpan = document.createElement('span');
  promptSpan.className = 'prompt';
  promptSpan.textContent = `user@jsterm:${cwd}$`;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'command-input';
  line.appendChild(promptSpan);
  line.appendChild(input);
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
  input.focus();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const cmd = input.value.trim();
      execute(cmd);
      line.removeChild(input);
      const echo = document.createElement('span');
      echo.textContent = ` ${cmd}`;
      line.appendChild(echo);
    }
  });
}
function execute(command) {
  if (!command) { prompt(); return; }
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  switch (cmd) {
    case 'clear': term.innerHTML = ''; break;
    case 'pwd': writeLine(cwd); break;
    case 'echo': writeLine(args.join(' ')); break;
    case 'ls': {
      const nodeInfo = getNode(cwd);
      if (!nodeInfo) { writeLine('ls: cannot access'); break; }
      const children = Object.entries(nodeInfo.node.children || {});
      const names = children.map(([name, info]) => name + (info.type === 'dir' ? '/' : '')).join('  ');
      writeLine(names);
      break;
    }
    case 'cat': {
      if (!args[0]) { writeLine('cat: missing operand'); break; }
      const filePath = resolvePath(args[0]);
      const nodeInfo = getNode(filePath);
      if (!nodeInfo) { writeLine(`cat: ${args[0]}: No such file or directory`); break; }
      if (nodeInfo.node.type !== 'file') { writeLine(`cat: ${args[0]}: Is a directory`); break; }
      writeLine(nodeInfo.node.content || '');
      break;
    }
    case 'cd': {
      const target = args[0] || '/';
      const resolved = resolvePath(target);
      if (getNode(resolved)) cwd = resolved; else writeLine(`cd: ${target}: No such file or directory`);
      break;
    }
    // Save filesystem to localStorage
    function saveFs() {
      try { localStorage.setItem('mockfs', JSON.stringify(fs)); } catch(e) {}
    }
    // Load persisted filesystem if present
    function loadFs() {
      const data = localStorage.getItem('mockfs');
      if (data) {
        try { Object.assign(fs, JSON.parse(data)); } catch(e) {}
      }
    }
    loadFs();

    case 'touch': {
      // Create an empty file at the given path, creating intermediate directories is not supported
      if (!args[0]) { writeLine('touch: missing operand'); break; }
      const targetPath = resolvePath(args[0]);
      // Separate directory and filename
      const parts = targetPath.split('/').filter(Boolean);
      const name = parts.pop();
      const parentPath = '/' + parts.join('/') || '/';
      const parentNodeInfo = getNode(parentPath);
      if (!parentNodeInfo) { writeLine(`touch: cannot create ${args[0]}: No such directory`); break; }
      const parentNode = parentNodeInfo.node;
      // If entry exists and is a directory, report error
      if (parentNode.children[name] && parentNode.children[name].type === 'dir') {
        writeLine(`touch: cannot create ${args[0]}: Is a directory`);
        break;
      }
      // Create file if not present
      if (!parentNode.children[name]) {
        parentNode.children[name] = {type: 'file', content: ''};
        saveFs();
      }
      writeLine('');
      break;
    }
    case 'rm': {
      const targetPath = resolvePath(args[0]);
      const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || '/';
      const name = targetPath.split('/').pop();
      const parentNodeInfo = getNode(parentPath);
      if (parentNodeInfo && parentNodeInfo.node.children[name]) {
        delete parentNodeInfo.node.children[name];
        saveFs();
      } else { writeLine(`rm: cannot remove '${args[0]}': No such file or directory`); }
      break;
    }
    case 'cp': {
      const src = resolvePath(args[0]);
      const dst = resolvePath(args[1]);
      const srcNodeInfo = getNode(src);
      if (!srcNodeInfo || srcNodeInfo.node.type !== 'file') { writeLine(`cp: cannot stat '${args[0]}': No such file`); break; }
      const dstParentPath = dst.substring(0, dst.lastIndexOf('/')) || '/';
      const dstName = dst.split('/').pop();
      const dstParentNodeInfo = getNode(dstParentPath);
      if (!dstParentNodeInfo) { writeLine(`cp: cannot create regular file '${args[1]}': No such directory`); break; }
      // copy content
      dstParentNodeInfo.node.children[dstName] = {type: 'file', content: srcNodeInfo.node.content};
      saveFs();
      break;
    }
    case 'mv': {
      const src = resolvePath(args[0]);
      const dst = resolvePath(args[1]);
      const srcInfo = getNode(src);
      if (!srcInfo) { writeLine(`mv: cannot stat '${args[0]}': No such file or directory`); break; }
      const srcParentPath = src.substring(0, src.lastIndexOf('/')) || '/';
      const srcName = src.split('/').pop();
      const dstParentPath = dst.substring(0, dst.lastIndexOf('/')) || '/';
      const dstName = dst.split('/').pop();
      const dstParentNode = getNode(dstParentPath);
      if (!dstParentNode) { writeLine(`mv: cannot move to '${args[1]}': No such directory`); break; }
      // move node
      dstParentNode.node.children[dstName] = srcInfo.node;
      const srcParentNode = getNode(srcParentPath);
      if (srcParentNode) delete srcParentNode.node.children[srcName];
      break;
    }
    default:
      writeLine(`${cmd}: command not found`);
  }
  prompt();
}
// start
prompt();
