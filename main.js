// DOM Elements
const dom = {
  editor: document.getElementById('editor'),
  output: document.getElementById('output'),
  dragbar: document.getElementById('dragbar'),
  container: document.getElementById('container'),
  exeButton: document.getElementById('exe'),
  clearButton: document.getElementById('clear'),
  shareButton: document.getElementById('share'),
  loading: document.getElementById('loading'),
  initialLoading: document.getElementById('initial-loading'),
  mainContent: document.getElementById('main-content')
};

let isDragging = false;
let editor = null;
let pyodide = null;

// Resize logic
dom.dragbar.addEventListener('mousedown', (e) => {
  if (window.innerWidth < 768) return;
  e.preventDefault();
  isDragging = true;
  document.body.style.cursor = 'row-resize';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging || window.innerWidth < 768) return;

  const containerOffsetTop = dom.container.offsetTop;
  const newEditorHeight = e.clientY - containerOffsetTop;
  const containerHeight = dom.container.clientHeight;

  const minEditorHeight = 100;
  const maxEditorHeight = containerHeight - 100;

  if (newEditorHeight >= minEditorHeight && newEditorHeight <= maxEditorHeight) {
    dom.editor.style.height = `${newEditorHeight}px`;
    const dragbarHeight = dom.dragbar.offsetHeight;
    const remainingHeight = containerHeight - newEditorHeight - dragbarHeight;
    dom.output.style.height = `${Math.max(remainingHeight, 50)}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = 'default';
  }
});

function clearOutput() {
  console.log("Clear Output.");
  dom.output.innerText = "";
}

function compressCodeLZMA(code, callback) {
  console.log("Starting LZMA compression...");
  LZMA.compress(code, 9, (result, error) => {
    if (error) {
      console.error("LZMA compression error:", error);
      callback(null);
    } else {
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result);
      const binaryString = String.fromCharCode(...bytes);
      const base64 = btoa(binaryString);
      const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      callback(base64url);
    }
  });
}

function decompressCodeLZMA(base64url, callback) {
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += '=';
    const binaryString = atob(base64);
    const byteArray = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    LZMA.decompress(byteArray, (result, error) => {
      if (error) callback(null);
      else callback(result);
    });
  } catch (e) {
    console.error("Invalid input for LZMA decompression:", e);
    callback(null);
  }
}

function getCodeFromUrl() {
  const fragment = window.location.hash.substring(1);
  const params = new URLSearchParams(fragment);
  const lzmaCode = params.get('lzma');
  if (lzmaCode) {
    return new Promise(resolve => {
      decompressCodeLZMA(lzmaCode, decompressed => resolve(decompressed || null));
    });
  }
  return Promise.resolve(null);
}

const pyodideReadyPromise = (async () => {
  const loadedPyodide = await loadPyodide();
  loadedPyodide.setStdout({
    batched: (msg) => {
      dom.output.innerText += msg + "\n";
      dom.output.scrollTop = dom.output.scrollHeight;
    }
  });
  loadedPyodide.setStderr({
    batched: (msg) => {
      dom.output.innerText += msg + "\n";
      dom.output.scrollTop = dom.output.scrollHeight;
    }
  });
  return loadedPyodide;
})();

const editorReadyPromise = new Promise((resolve) => {
  require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    getCodeFromUrl().then(initialCode => {
      const createdEditor = monaco.editor.create(dom.editor, {
        value: initialCode || 'print("Hello World")',
        language: 'python',
        theme: 'vs-dark',
        fontSize: 18,
        wordWrap: 'on',
        lineNumbersMinChars: 3,
        automaticLayout: true,
        minimap: { enabled: false }
      });
      createdEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (!dom.exeButton.disabled) main();
      });
      resolve(createdEditor);
    });
  });
});

Promise.all([pyodideReadyPromise, editorReadyPromise])
  .then(([loadedPyodide, createdEditor]) => {
    pyodide = loadedPyodide;
    editor = createdEditor;

    dom.initialLoading.classList.add('hidden');
    dom.mainContent.classList.remove('hidden');

    dom.exeButton.onclick = main;
    dom.clearButton.onclick = clearOutput;
    dom.shareButton.onclick = shareCode;

    const containerHeight = dom.container.clientHeight;
    const initialEditorHeight = containerHeight * 0.6;
    const initialOutputHeight = containerHeight * 0.4 - dom.dragbar.offsetHeight;
    dom.editor.style.height = `${initialEditorHeight}px`;
    dom.output.style.height = `${initialOutputHeight}px`;
  })
  .catch(error => {
    console.error("Initialization failed:", error);
    dom.initialLoading.innerText = "Error: Initialization failed. Please check the console for details.";
    dom.initialLoading.style.color = 'red';
  });

async function main() {
  dom.exeButton.disabled = true;
  dom.loading.style.display = "inline";
  document.querySelectorAll("canvas, img.matplotlib").forEach(el => el.remove());

  try {
    const code = editor.getValue();
    await pyodide.runPythonAsync(code);
  } catch (error) {
    dom.output.innerText += "\n" + error;
    dom.output.scrollTop = dom.output.scrollHeight;
  } finally {
    dom.loading.style.display = "none";
    dom.exeButton.disabled = false;
  }
}

function shareCode() {
  if (!editor) {
    alert("Editor is not ready. Please wait a moment.");
    return;
  }

  const code = editor.getValue();
  if (typeof LZMA === 'undefined' || typeof LZMA.compress !== 'function') {
    alert("Sharing function is not available. LZMA library failed to load.");
    return;
  }

  compressCodeLZMA(code, (compressed) => {
    if (!compressed) {
      alert("Failed to compress code.");
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}#lzma=${compressed}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert('Link copied to clipboard！'))
      .catch(() => alert('Copy to clipboard failed.\n' + shareUrl));
  });
}
