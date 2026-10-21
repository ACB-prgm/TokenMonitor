param([string]$Mode = '')
$ErrorActionPreference = 'Stop'
# Hash directly through .NET: inherited PSModulePath may refer to another
# PowerShell edition, and runtime verification must not depend on its modules.
function Get-RuntimeDigest([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}
$pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expected = [IO.File]::ReadAllText((Join-Path $pluginRoot 'runtime/node.sha256')).Trim()
if ($expected -notmatch '^[0-9a-f]{64}$') { throw 'Invalid bundled runtime digest' }
$nodePath = Join-Path $pluginRoot 'runtime/node.exe'
if (!(Test-Path -LiteralPath $nodePath)) {
    $dataRoot = $env:PLUGIN_DATA
    if (!$dataRoot) {
        $codexRoot = $env:CODEX_HOME
        if (!$codexRoot) { $codexRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
        $dataRoot = Join-Path $codexRoot 'token-monitor-embedded'
    }
    $cacheRoot = Join-Path $dataRoot "runtime/$expected"
    [IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
    $nodePath = Join-Path $cacheRoot 'node.exe'
    if (!(Test-Path -LiteralPath $nodePath) -or (Get-RuntimeDigest $nodePath) -ne $expected) {
        $temporary = Join-Path $cacheRoot ([Guid]::NewGuid().ToString() + '.tmp')
        try {
            $source = [IO.File]::OpenRead((Join-Path $pluginRoot 'runtime/node.gz'))
            try {
                $gzip = New-Object IO.Compression.GZipStream($source, [IO.Compression.CompressionMode]::Decompress)
                try { $destination = [IO.File]::Create($temporary); try { $gzip.CopyTo($destination) } finally { $destination.Dispose() } } finally { $gzip.Dispose() }
            } finally { $source.Dispose() }
            if ((Get-RuntimeDigest $temporary) -ne $expected) { throw 'Bundled runtime checksum mismatch' }
            # Another concurrent launcher may have already published the same bytes.
            try { [IO.File]::Move($temporary, $nodePath) } catch {
                if (!(Test-Path -LiteralPath $nodePath) -or (Get-RuntimeDigest $nodePath) -ne $expected) {
                    Remove-Item -LiteralPath $nodePath -Force -ErrorAction SilentlyContinue
                    [IO.File]::Move($temporary, $nodePath)
                }
            }
        } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
    }
}
switch ($Mode) {
    'node-version' { $nodeArguments = '--version' }
    'install' { $nodeArguments = '"' + (Join-Path $pluginRoot 'server/dist/install.mjs') + '"' }
    'verify-install' { $nodeArguments = '"' + (Join-Path $pluginRoot 'server/dist/install.mjs') + '" --verify-only' }
    'hook' { $nodeArguments = '"' + (Join-Path $pluginRoot 'server/dist/hook.mjs') + '"' }
    'startup-hook' { $nodeArguments = '"' + (Join-Path $pluginRoot 'server/dist/startup-hook.mjs') + '"' }
    '' { $nodeArguments = '"' + (Join-Path $pluginRoot 'server/dist/index.mjs') + '"' }
    default { exit 2 }
}
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $nodePath
$start.Arguments = $nodeArguments
$start.UseShellExecute = $false
$start.RedirectStandardInput = $true
$start.CreateNoWindow = $true
# .NET Framework chooses the child stdin writer encoding from Console.
# Its default UTF-8 BOM otherwise precedes even direct BaseStream writes.
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
$child = [Diagnostics.Process]::Start($start)
try {
    # Forward each available chunk and flush it immediately. FileStream's
    # buffered CopyToAsync waits for EOF for small MCP messages otherwise.
    $rawInput = $child.StandardInput.BaseStream
    $source = [Console]::OpenStandardInput()
    $buffer = New-Object byte[] 16384
    $readTask = $source.ReadAsync($buffer, 0, $buffer.Length)
    while (!$child.HasExited) {
        if (!$readTask.IsCompleted) { [Threading.Thread]::Sleep(20); continue }
        $count = $readTask.GetAwaiter().GetResult()
        if ($count -eq 0) { $rawInput.Close(); break }
        $rawInput.Write($buffer, 0, $count)
        $rawInput.Flush()
        $readTask = $source.ReadAsync($buffer, 0, $buffer.Length)
    }
    $child.WaitForExit()
    exit $child.ExitCode
} finally { $child.Dispose() }
