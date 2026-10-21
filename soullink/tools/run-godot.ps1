[CmdletBinding()]
param(
    [ValidateSet('import', 'test', 'smoke', 'capture', 'render', 'feedback', 'combat', 'audio', 'web', 'pack')]
    [string]$Mode = 'test',
    [string]$Godot = 'C:\Users\user\Desktop\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64_console.exe'
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config = Join-Path $root 'build/engine-config'
$temp = Join-Path $root 'build/temp'
$artifacts = Join-Path $root 'artifacts'
New-Item -ItemType Directory -Path $config, $temp, $artifacts, (Join-Path $root 'build/web') -Force | Out-Null
$previous = @{}
foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    if ($Mode -eq 'web') {
        $source = Join-Path $previous['APPDATA'] 'Godot/export_templates/4.7.2.stable'
        $destination = Join-Path $config 'Godot/export_templates/4.7.2.stable'
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        foreach ($name in @('web_nothreads_release.zip', 'web_nothreads_debug.zip')) {
            Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $destination $name) -Force
        }
    }
    $env:APPDATA = $config
    $env:LOCALAPPDATA = $config
    $env:TEMP = $temp
    $env:TMP = $temp
    $arguments = @('--path', $root, '--log-file', (Join-Path $artifacts "$Mode.log"))
    switch ($Mode) {
        'import' { $arguments += @('--headless', '--editor', '--import') }
        'test' { $arguments += @('--headless', '--script', 'tests/core_test.gd') }
        'smoke' { $arguments += @('--headless', '--quit-after', '180', '--', '--ui-smoke') }
        'capture' { $arguments += @('--windowed', '--resolution', '390x844', '--quit-after', '180', '--', '--capture') }
        'render' { $arguments += @('--windowed', '--resolution', '390x844', '--quit-after', '2400', '--script', 'tests/render_check.gd') }
        'feedback' { $arguments += @('--windowed', '--resolution', '390x844', '--quit-after', '2400', '--script', 'tests/feedback_check.gd') }
        'combat' { $arguments += @('--windowed', '--resolution', '390x844', '--quit-after', '2400', '--script', 'tests/combat_ui_check.gd') }
        'audio' { $arguments += @('--windowed', '--resolution', '390x844', '--quit-after', '1200', '--script', 'tests/audio_check.gd') }
        'web' { $arguments += @('--headless', '--export-release', 'Web', (Join-Path $root 'build/web/index.html')) }
        'pack' { $arguments += @('--headless', '--main-pack', (Join-Path $root 'build/web/index.pck'), '--quit-after', '180', '--', '--ui-smoke') }
    }
    & $Godot @arguments
    $exitCode = $LASTEXITCODE
    if ($Mode -eq 'web' -and $exitCode -eq 0) {
        Copy-Item -LiteralPath (Join-Path $root 'web/host-bridge.js') -Destination (Join-Path $root 'build/web/host-bridge.js') -Force
        & node (Join-Path $root 'tools/audio-runtime.cjs')
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
        & node (Join-Path $root 'tools/intro-runtime.cjs')
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
    }
    if ($exitCode -eq 0 -and (Select-String -LiteralPath (Join-Path $artifacts "$Mode.log") -Pattern 'SCRIPT ERROR:|Parse Error:' -Quiet)) {
        $exitCode = 1
    }
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
exit $exitCode
