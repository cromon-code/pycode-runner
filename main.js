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

// Resizing editor area
dragbar.addEventListener('mousedown', (e) => {
  if (window.innerWidth < 768) return; // Disabled on smartphones
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

    const getCodeFromUrl = () => {
      // check fragment id
      const fragment = window.location.hash.substring(1);  // remove '#'
      const params = new URLSearchParams(fragment);
      const compressedCode = params.get('code');

      if (compressedCode) {
        try {
          // Decompress using lz-string
          const decompressedCode
          if (decompressedCode !== null) {
            return decompressedCode;
          } else {
            console.error("Failed to decode code from URL Fragment: Decompression failed");
          }
        } catch (e) {
          console.error("Failed to decode code from URL Fragment:", e);
        }
      }
      // If the fragment does not have the code, also check for old-style query parameters (for compatibility reasons)
      const queryParams = new URLSearchParams(window.location.search);
      const encodedCode = new URLSearchParams(window.location.search).get('code');
      if (encodedCode) {
        try {
          return decodeURIComponent(atob(encodedCode));
        } catch (e) {
          console.error("Failed to decode code from URL:", e);
        }
      }
      return null;
    };

    const initialCode = getCodeFromUrl() || 'print("Hello World")';

    const createdEditor = monaco.editor.create(editorElement, {
      value: initialCode,
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

// UI switching and button assignments after initialization is complete
Promise.all([pyodideReadyPromise, editorReadyPromise])
  .then(([loadedPyodide, createdEditor]) => {
    pyodide = loadedPyodide;
    editor = createdEditor;

    initialLoadingElement.classList.add('hidden');
    mainContentElement.classList.remove('hidden');

    exeButton.onclick = main;
    shareButton.onclick = shareCode;

    console.log("All components ready.");

    // Set initial size with window.onload
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

// Run
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

// Share
function shareCode() {
  const code = editor.getValue();
  const compressedCode = LZString.compressToEncodedURIComponent(code);
  const shareUrl = `${window.location.origin}${window.location.pathname}#code=${compressedCode}`;

  navigator.clipboard.writeText(shareUrl)
    .then(() => alert('Link copied to clipboard！'))
    .catch(err => {
      console.error('Copy to clipboard failed:', err);
      alert('Copy to clipboard failed.\n' + shareUrl);
    });
}
