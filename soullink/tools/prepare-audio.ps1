param([string]$Ffmpeg = "$PSScriptRoot/../build/audio-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe")
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Join-Path $root 'build/audio-source'
$output = Join-Path $root 'assets/audio'
function Convert-Audio($InputFile, $OutputFile, $Options) {
    & $Ffmpeg -hide_banner -loglevel error -y -i $InputFile @Options -map_metadata -1 $OutputFile
    if ($LASTEXITCODE -ne 0) { throw "Audio conversion failed: $OutputFile" }
}
# Keep a beat-aligned 64-bar section rather than shipping the full 201s battle track.
Convert-Audio (Join-Path $source 'black-diamond.mp3') (Join-Path $output 'music/battle-black-diamond.mp3') @('-ss', '26.853146853', '-t', '107.412587413', '-af', 'volume=-3dB,afade=t=in:d=0.008,afade=t=out:st=107.404587:d=0.008', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '112k')
Convert-Audio (Join-Path $source 'technovillain.mp3') (Join-Path $output 'music/menu-technovillain.mp3') @('-af', 'volume=-1.5dB', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k')
$sounds = @{
    ui = @('interface', 'click_001.ogg'); swap = @('interface', 'drop_001.ogg')
    turn = @('interface', 'confirmation_001.ogg'); red = @('digital', 'laser5.ogg')
    blue = @('digital', 'zapThreeToneDown.ogg'); green = @('digital', 'phaseJump1.ogg')
    mana = @('digital', 'powerUp3.ogg'); hit = @('impact', 'impactPunch_heavy_000.ogg')
    shield = @('impact', 'impactMetal_light_001.ogg'); cast = @('digital', 'phaserUp3.ogg')
    drop = @('interface', 'drop_002.ogg'); victory = @('digital', 'highUp.ogg')
    defeat = @('digital', 'lowDown.ogg')
}
$receipts = @()
foreach ($id in ($sounds.Keys | Sort-Object)) {
    $pack, $name = $sounds[$id]
    $original = @(Get-ChildItem -LiteralPath (Join-Path $source $pack) -Recurse -File | Where-Object { $_.Name -eq $name })
    if ($original.Count -ne 1) { throw "Expected one source: $pack/$name" }
    $target = Join-Path $output "sfx/$id.wav"
    Convert-Audio $original[0].FullName $target @('-t', '0.8', '-af', 'alimiter=limit=0.85:level=false,afade=t=out:st=0.75:d=0.05', '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le')
    $receipts += @{ id = $id; pack = $pack; original = $name; source_sha256 = (Get-FileHash $original[0].FullName -Algorithm SHA256).Hash.ToLower(); output_sha256 = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower() }
}
foreach ($pack in @('digital', 'impact', 'interface')) {
    Copy-Item -LiteralPath (Join-Path $source "$pack/License.txt") -Destination (Join-Path $root "assets/licenses/Kenney-$pack-CC0.txt") -Force
}
$receipts | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'artifacts/audio-conversion.json') -Encoding utf8
Get-ChildItem $output -Recurse -File | Select-Object Name, Length
