Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param(
        [string]$Path,
        [int]$NewWidth,
        [int]$NewHeight
    )
    $fullPath = Resolve-Path $Path
    $src = [System.Drawing.Image]::FromFile($fullPath)
    $dest = New-Object System.Drawing.Bitmap($NewWidth, $NewHeight)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    
    # Force pixelated, ultra-sharp rendering with zero blur
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.DrawImage($src, 0, 0, $NewWidth, $NewHeight)
    $g.Dispose()
    $src.Dispose()
    
    $tempPath = $fullPath.Path + ".tmp"
    $dest.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dest.Dispose()
    
    # Overwrite original
    Remove-Item $fullPath
    Rename-Item $tempPath -NewName (Split-Path $Path -Leaf)
    
    $finalFile = Get-Item $Path
    Write-Host "Successfully resized $Path to $NewWidth x $NewHeight (New size: $($finalFile.Length / 1KB) KB)"
}

Write-Host "Starting pixel-perfect sprite sheet compression..."
Resize-Image -Path "assets/fatdoremon.png" -NewWidth 768 -NewHeight 512
Resize-Image -Path "assets/doremon.png" -NewWidth 512 -NewHeight 418
Resize-Image -Path "assets/dorayaki.png" -NewWidth 627 -NewHeight 627
Write-Host "Compression completed!"
