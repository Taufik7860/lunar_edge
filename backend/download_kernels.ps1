# LUNAR EDGE — Robust Kernel Downloader using native curl.exe

$destDir = "C:\Users\Nikhil\Desktop\nasa\backend\data\kernels"
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

$kernels = @(
    @{ Name = "naif0012.tls"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls" },
    @{ Name = "de440s.bsp"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp" },
    @{ Name = "moon_pa_de440_200625.bpc"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc" },
    @{ Name = "moon_de440_250416.tf"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf" },
    @{ Name = "moon_assoc_me.tf"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_assoc_me.tf" },
    @{ Name = "pck00011.tpc"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc" },
    @{ Name = "earth_latest_high_prec.bpc"; Url = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/earth_latest_high_prec.bpc" }
)

Write-Host "Downloading SPICE kernels using curl.exe..."
foreach ($k in $kernels) {
    $target = Join-Path $destDir $k.Name
    if ((Test-Path $target) -and ((Get-Item $target).Length -gt 100)) {
        Write-Host "[EXISTS] $($k.Name) ($([math]::Round((Get-Item $target).Length / 1KB, 1)) KB)"
    } else {
        Write-Host "[DOWNLOADING] $($k.Name) ..."
        curl.exe -L --fail --retry 3 --retry-delay 2 -o $target $k.Url
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Successfully downloaded $($k.Name) ($([math]::Round((Get-Item $target).Length / 1KB, 1)) KB)"
        } else {
            Write-Error "  Failed to download $($k.Name)"
        }
    }
}

# Clean any leftover tmp files
Remove-Item (Join-Path $destDir "*.tmp") -ErrorAction SilentlyContinue

Write-Host "`nAll kernel files currently in directory:"
Get-ChildItem $destDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
