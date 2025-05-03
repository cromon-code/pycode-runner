// pyodide-setup.js

// Pyodideの初期化と設定
async function initializePyodide(outputElement) {
    console.log("Pyodide loading started...");
    const pyodide = await loadPyodide();

    pyodide.setStdout({
        batched: (msg) => {
            outputElement.innerText += msg + "\n";
            outputElement.scrollTop = outputElement.scrollHeight;
        }
    });

    pyodide.setStderr({
        batched: (msg) => {
            outputElement.innerText += msg + "\n";
            outputElement.scrollTop = outputElement.scrollHeight;
        }
    });

    // サンドボックス化 (必要に応じて調整)
    await pyodide.loadPackages(['micropip']);
    await pyodide.runPythonAsync(`
        import os, sys, io, pyodide, builtins

        # ファイルシステム制限
        sys.modules['os'].__dict__['remove'] = None
        sys.modules['os'].__dict__['unlink'] = None
        sys.modules['os'].__dict__['rename'] = None
        sys.modules['os'].__dict__['rmdir'] = None
        sys.modules['os'].__dict__['makedirs'] = None
        sys.modules['os'].__dict__['mkdir'] = None

        def restricted_open(*args, **kwargs):
            if 'w' in args[1] or 'a' in args[1] or 'x' in args[1]:
                raise OSError("書き込み操作は禁止されています")
            return original_open(*args, **kwargs)

        original_open = io.open
        io.open = restricted_open
        sys.modules['io'].__dict__['open'] = restricted_open

        # ネットワークアクセス制限
        sys.modules['urllib.request'].__dict__['urlopen'] = None
        sys.modules['requests'].__dict__['get'] = None
        sys.modules['requests'].__dict__['post'] = None

        # 動的コード実行制限
        builtins.eval = None
        builtins.exec = None
    `);

    console.log("Pyodide ready.");
    return pyodide;
}

// タイムアウト処理
async function runWithTimeout(pyodide, code, timeout) {
    let timeoutId;
    const resultPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("実行時間が超過しました")), timeout);
        pyodide.runPythonAsync(code)
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timeoutId));
    });

    return resultPromise;
}

export { initializePyodide, runWithTimeout };