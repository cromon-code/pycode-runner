const editorElement = document.getElementById('editor');
const outputElement = document.getElementById('output');
const dragbar = document.getElementById('dragbar');
const container = document.getElementById('container');
const exeButton = document.getElementById('exe');
const shareButton = document.getElementById('share');
const loadingElement = document.getElementById('loading');
const initialLoadingElement = document.getElementById('initial-loading');
const mainContentElement = document.getElementById('main-content');
const header = document.getElementById('header'); // このheader変数はHTMLに使われていませんが、コードには存在します
const footer = document.getElementById('footer'); // このfooter変数はHTMLに使われていませんが、コードには存在します


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
  console.log("Starting LZMA compression..."); // 圧縮開始ログ
  // LZMA.compressは非同期でworkerを使って圧縮を実行します
  // resultは圧縮されたバイト配列（通常Uint8Array）またはLZMAライブラリ特有の形式です
  LZMA.compress(code, 9, (result, error) => {
    console.log("LZMA compress callback received."); // コールバック到達ログ
    if (error) {
      console.error("LZMA compression error:", error);
      callback(null);
    } else {
      console.log("Compression successful. Result type:", result.constructor.name, "Length:", result.length); // 圧縮成功ログと結果の確認

      // LZMAの出力（バイト配列）を、btoaで安全に扱えるバイナリ文字列に変換
      // btoaはLatin1の文字列しか扱えないため、バイト値を直接文字コードとする文字列を作成します。
      let binaryString = '';
      // resultが必ずしもUint8Arrayとは限らない場合を考慮して Uint8Array に変換（LZMAライブラリの実装による）
      // LZMA_worker-min.jsの場合、resultは Uint8Array になるはずですが、念のため
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result);

      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      console.log("Converted bytes to binary string. Length:", binaryString.length); // バイナリ文字列変換ログ

      // バイナリ文字列をbtoaでBase64エンコード
      // これでバイナリデータをASCII文字列として表現できます。
      const base64 = btoa(binaryString);
      console.log("Base64 encoded. Length:", base64.length); // Base64エンコードログ

      // Base64文字列をURLセーフな形式に変換
      // + -> -, / -> _, 末尾の = を削除
      const base64url = base64
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      console.log("Converted to Base64URL. Length:", base64url.length); // Base64URL変換ログ

      callback(base64url); // URLセーフなBase64文字列をコールバックに渡して処理を続行
    }
  });
  console.log("LZMA.compress called (asynchronous)."); // 圧縮呼び出しログ
}

function decompressCodeLZMA(base64url, callback) {
  console.log("Starting LZMA decompression..."); // 解凍開始ログ
  try {
    // URLセーフなBase64を元のBase64に戻す
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    // 欠落した末尾の = を補う（atobが要求する場合がある）
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    console.log("Converted Base64URL to Base64. Length:", base64.length); // Base64に戻したログ


    // Base64文字列をバイナリ文字列に戻す
    const binaryString = atob(base64);
    console.log("Base64 decoded to binary string. Length:", binaryString.length); // デコードログ

    // バイナリ文字列をバイト配列（Uint8Array）に変換
    const byteArray = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    console.log("Converted binary string to Uint8Array. Length:", byteArray.length); // Uint8Array変換ログ

    // LZMAで解凍
    LZMA.decompress(byteArray, (result, error) => {
      console.log("LZMA decompress callback received."); // 解凍コールバック到達ログ
      if (error) {
        console.error("LZMA decompression error:", error);
        callback(null);
      } else {
        console.log("Decompression successful. Result type:", result.constructor.name, "Length:", result.length); // 解凍成功ログ
        // LZMA.decompressの結果は通常文字列です
        callback(result); // コールバックを呼び出し
      }
    });
  } catch (e) {
    console.error("Invalid base64url input for LZMA decompression:", e);
    callback(null);
  }
  console.log("LZMA.decompress called (asynchronous)."); // 解凍呼び出しログ
}


// Get code from URL
function getCodeFromUrl() {
  const fragment = window.location.hash.substring(1);
  const params = new URLSearchParams(fragment);
  const lzmaCode = params.get('lzma');
  const compressedCode = params.get('code'); // This uses LZString, not LZMA

  if (lzmaCode) {
    console.log("Found 'lzma' parameter in URL. Decompressing with LZMA...");
    return new Promise(resolve => {
      decompressCodeLZMA(lzmaCode, decompressed => {
        if (decompressed !== null) {
          console.log("LZMA decompression successful.");
        } else {
          console.error("LZMA decompression failed.");
          // 失敗した場合、元のLZStringのコードも試すか、または単にnullを返すか
          // ここではLZMA優先なので、失敗したらnullを返します
        }
        resolve(decompressed || null);
      });
    });
  }

  console.log("No code parameter found in URL.");
  return Promise.resolve(null); // パラメータがない場合はnullを返す
}

// Load Pyodide
const pyodideReadyPromise = (async () => {
  console.log("Pyodide loading started...");
  const loadedPyodide = await loadPyodide();

  // 標準出力と標準エラー出力をoutputElementにリダイレクト
  loadedPyodide.setStdout({
    batched: (msg) => {
      outputElement.innerText += msg + "\n";
      outputElement.scrollTop = outputElement.scrollHeight; // スクロールを一番下へ
    }
  });

  loadedPyodide.setStderr({
    batched: (msg) => {
      outputElement.innerText += msg + "\n";
      outputElement.scrollTop = outputElement.scrollHeight; // スクロールを一番下へ
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
    // URLからコードを取得し、エディタの初期値に設定
    getCodeFromUrl().then(initialCode => {
      console.log("Initial code from URL:", initialCode ? "Loaded" : "None found", initialCode);
      const createdEditor = monaco.editor.create(editorElement, {
        value: initialCode || 'print("Hello World")', // URLにコードがない場合はデフォルトコード
        language: 'python',
        theme: 'vs-dark',
        fontSize: 18,
        wordWrap: 'on',
        lineNumbersMinChars: 3,
        automaticLayout: true, // コンテナサイズ変更時にエディタを自動調整
        minimap: { enabled: false }
      });

      // Ctrl + Enter でコード実行のショートカットを追加
      createdEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        // 実行ボタンが非活性でない場合のみ実行
        if (!exeButton.disabled) main();
      });

      console.log("Monaco Editor ready.");
      resolve(createdEditor);
    });
  });
});

// UI初期化と準備完了後の処理
Promise.all([pyodideReadyPromise, editorReadyPromise])
  .then(([loadedPyodide, createdEditor]) => {
    pyodide = loadedPyodide;
    editor = createdEditor;

    // ローディング表示を隠し、メインコンテンツを表示
    initialLoadingElement.classList.add('hidden');
    mainContentElement.classList.remove('hidden');

    // ボタンクリックハンドラを設定
    exeButton.onclick = main;
    shareButton.onclick = shareCode;

    console.log("All components (Pyodide, Editor) ready. UI initialized.");

    // ウィンドウ読み込み完了後の初期レイアウト調整
    window.onload = () => {
      console.log("window.onload fired.");
      const containerHeight = container.clientHeight;
      console.log("container.clientHeight (onload):", containerHeight);
      const initialEditorHeight = containerHeight * 0.6; // 例: エディタ6割
      const initialOutputHeight = containerHeight * 0.4 - dragbar.offsetHeight; // 例: 出力4割 - ドラッグバーの高さ

      // スタイルを適用
      editorElement.style.height = `${initialEditorHeight}px`;
      outputElement.style.height = `${initialOutputHeight}px`;
      console.log(`Initial layout set: Editor height ${initialEditorHeight}px, Output height ${initialOutputHeight}px`);
    };
    // automaticLayout: true が設定されているので、リサイズや親要素の表示/非表示でエディタサイズは自動調整されます

  })
  .catch(error => {
    console.error("Initialization failed:", error);
    // エラーメッセージをユーザーに表示
    initialLoadingElement.innerText = "Error: Initialization failed. Please check the console for details.";
    initialLoadingElement.style.color = 'red';
  });

// Execute Python code
async function main() {
  console.log("Run button clicked. Starting execution.");
  // 実行中はボタンを無効化し、ローディング表示
  exeButton.disabled = true;
  loadingElement.style.display = "inline";
  // 以前のMatplotlibなどのcanvasや画像をクリア (もしあれば)
  document.querySelectorAll("canvas, img.matplotlib").forEach(el => el.remove());

  try {
    const code = editor.getValue(); // エディタからコードを取得
    console.log("Executing code:", code.substring(0, 100) + (code.length > 100 ? '...' : '')); // コードの一部をログ出力
    // PyodideでPythonコードを実行 (非同期)
    await pyodide.runPythonAsync(code);
    console.log("Python execution finished successfully.");
  } catch (error) {
    console.error("Python execution error:", error);
    // エラーをoutputElementに表示
    outputElement.innerText += "\n" + error;
    outputElement.scrollTop = outputElement.scrollHeight; // スクロールを一番下へ
  } finally {
    // 実行終了後の処理 (成功・失敗に関わらず)
    loadingElement.style.display = "none"; // ローディング表示を隠す
    exeButton.disabled = false; // ボタンを有効化
    console.log("Execution process completed.");
  }
}

// Share code
function shareCode() {
  console.log("shareCode function started."); // 処理開始ログ

  // editorがまだ初期化されていない場合は処理を中断
  if (!editor) {
      console.error("Editor is not initialized yet.");
      alert("Editor is not ready. Please wait a moment.");
      return;
  }

  const code = editor.getValue();
  console.log("Code obtained from editor. Length:", code.length); // エディタからのコード取得ログ

  // LZMAライブラリが利用可能かチェック
  // LZMAはlzma_worker-min.jsでグローバルに公開される想定です。
  if (typeof LZMA === 'undefined' || typeof LZMA.compress !== 'function') {
    console.error("LZMA library is not available or not fully loaded.");
    alert("Sharing function is not available. LZMA library failed to load. Please check console.");
    return;
  }
  console.log("LZMA library appears to be available."); // LZMAチェック通過ログ

  // コードをLZMAで圧縮し、コールバックで処理を続行
  compressCodeLZMA(code, (compressed) => {
    console.log("compressCodeLZMA callback received."); // 圧縮コールバック到達ログ

    // 圧縮に失敗した場合
    if (!compressed) {
      console.error("Failed to compress code during LZMA compression."); // 圧縮失敗の詳細ログ
      alert("Failed to compress code.");
      return;
    }
    console.log("Code compressed successfully. Compressed length:", compressed.length); // 圧縮成功ログ

    // 共有用URLを生成
    // 現在のページのオリジンとパスに、圧縮されたコードをフラグメントとして追加
    const shareUrl = `${window.location.origin}${window.location.pathname}#lzma=${compressed}`;
    console.log("Generated share URL:", shareUrl); // 生成されたURLログ

    // Clipboard APIを使用してURLをクリップボードにコピー
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        console.log('Link copied to clipboard successfully.'); // コピー成功ログ
        alert('Link copied to clipboard！'); // ユーザーへの通知
      })
      .catch(err => {
        console.error('Copy to clipboard failed:', err); // コピー失敗の詳細ログ
        // クリップボードへのコピーが失敗した場合、ユーザーにURLをalertで表示するなどの代替手段
        alert('Copy to clipboard failed.\n' + shareUrl); // ユーザーへの通知（URLも含む）
      });
  });

  console.log("shareCode function finished (asynchronous compression started)."); // 処理終了ログ（非同期部分除く）
}
