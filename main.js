const editorElement = document.getElementById('editor');
const outputElement = document.getElementById('output');
const dragbar = document.getElementById('dragbar');
const container = document.getElementById('container');
const exeButton = document.getElementById('exe');
const shareButton = document.getElementById('share');
const loadingElement = document.getElementById('loading');
const initialLoadingElement = document.getElementById('initial-loading');
const mainContentElement = document.getElementById('main-content');
const header = document.getElementById('header');
const footer = document.getElementById('footer');

let isDragging = false;
let editor = null;
let pyodide = null;

// Resize logic
dragbar.addEventListener('mousedown', (e) => {
  if (window.innerWidth < 768) return;
  e.preventDefault();
  isDragging = true;
  document.body.style.cursor = 'row-resize';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging || window.innerWidth < 768) return;

  const containerOffsetTop = container.offsetTop;
  const newEditorHeight = e.clientY - containerOffsetTop;
  const containerHeight = container.clientHeight;

  const minEditorHeight = 100;
  const maxEditorHeight = containerHeight - 100;

  if (newEditorHeight >= minEditorHeight && newEditorHeight <= maxEditorHeight) {
    editorElement.style.height = `${newEditorHeight}px`;

    const dragbarHeight = dragbar.offsetHeight;
    const remainingHeight = containerHeight - newEditorHeight - dragbarHeight;
    outputElement.style.height = `${Math.max(remainingHeight, 50)}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = 'default';
  }
});

// LZMA utils
function compressCodeLZMA(code, callback) {
  LZMA.compress(code, 9, (result, error) => {
    if (error) {
      console.error("LZMA compression error:", error);
      callback(null);
    } else {
      const base64url = btoa(String.fromCharCode(...result))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      callback(base64url);
    }
  });
}

function decompressCodeLZMA(base64url, callback) {
  try {
    const binaryString = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
    const byteArray = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    LZMA.decompress(byteArray, (result, error) => {
      if (error) {
        console.error("LZMA decompression error:", error);
        callback(null);
      } else {
        callback(result);
      }
    });
  } catch (e) {
    console.error("Invalid base64url input for LZMA:", e);
    callback(null);
  }
}

// Get code from URL
function getCodeFromUrl() {
  const fragment = window.location.hash.substring(1);
  const params = new URLSearchParams(fragment);
  const lzmaCode = params.get('lzma');
  const compressedCode = params.get('code');

  if (lzmaCode) {
    return new Promise(resolve => {
      decompressCodeLZMA(lzmaCode, decompressed => {
        resolve(decompressed || null);
      });
    });
  }

  if (compressedCode) {
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(compressedCode);
      return Promise.resolve(decompressed || null);
    } catch (e) {
      console.error("LZString decompression error:", e);
    }
  }

  return Promise.resolve(null);
}

// Load Pyodide
const pyodideReadyPromise = (async () => {
  console.log("Pyodide loading started...");
  const loadedPyodide = await loadPyodide();

  loadedPyodide.setStdout({
    batched: (msg) => {
      outputElement.innerText += msg + "\n";
      outputElement.scrollTop = outputElement.scrollHeight;
    }
  });

  loadedPyodide.setStderr({
    batched: (msg) => {
      outputElement.innerText += msg + "\n";
      outputElement.scrollTop = outputElement.scrollHeight;
    }
  });

  console.log("Pyodide ready.");
  return loadedPyodide;
})();

// Load Monaco Editor
const editorReadyPromise = new Promise((resolve) => {
  require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  console.log("Monaco Editor loading started...");

  require(['vs/editor/editor.main'], () => {
    console.log("Monaco Editor modules loaded.");
    getCodeFromUrl().then(initialCode => {
      const createdEditor = monaco.editor.create(editorElement, {
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
        if (!exeButton.disabled) main();
      });

      console.log("Monaco Editor ready.");
      resolve(createdEditor);
    });
  });
});

// UI init
Promise.all([pyodideReadyPromise, editorReadyPromise])
  .then(([loadedPyodide, createdEditor]) => {
    pyodide = loadedPyodide;
    editor = createdEditor;

    initialLoadingElement.classList.add('hidden');
    mainContentElement.classList.remove('hidden');

    exeButton.onclick = main;
    shareButton.onclick = shareCode;

    console.log("All components ready.");

    window.onload = () => {
      const containerHeight = container.clientHeight;
      console.log("container.clientHeight (onload):", containerHeight);
      const initialEditorHeight = containerHeight * 0.6;
      const initialOutputHeight = containerHeight * 0.4 - dragbar.offsetHeight;

      editorElement.style.height = `${initialEditorHeight}px`;
      outputElement.style.height = `${initialOutputHeight}px`;
    };
  })
  .catch(error => {
    console.error("Initialization failed:", error);
    initialLoadingElement.innerText = "Error: Initialization failed.";
    initialLoadingElement.style.color = 'red';
  });

// Execute Python
async function main() {
  exeButton.disabled = true;
  loadingElement.style.display = "inline";
  outputElement.innerText += "";
  document.querySelectorAll("canvas, img.matplotlib").forEach(el => el.remove());

  try {
    const code = editor.getValue();
    await pyodide.runPythonAsync(code);
  } catch (error) {
    console.error("Python execution error:", error);
    outputElement.innerText += "\n" + error;
  } finally {
    loadingElement.style.display = "none";
    exeButton.disabled = false;
  }
}

// Share code
function shareCode() {
  const code = editor.getValue();
  compressCodeLZMA(code, (compressed) => {
    if (!compressed) {
      alert("Failed to compress code.");
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}#lzma=${compressed}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert('Link copied to clipboard！'))
      .catch(err => {
        console.error('Copy to clipboard failed:', err);
        alert('Copy to clipboard failed.\n' + shareUrl);
      });
  });
}
