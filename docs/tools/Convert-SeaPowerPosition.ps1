<#
.SYNOPSIS
    Convert between real-world lat/long and Sea Power `RelativePositionInNM` offsets.

.DESCRIPTION
    Sea Power mission unit positions are `RelativePositionInNM=X,Y,Z`, an offset in
    NAUTICAL MILES from the mission map centre ([Environment] MapCenterLatitude/Longitude):
        X = +East / -West     Z = +North / -South     Y = 0 surface / 'low' land / depth for subs
    Z = (lat - centerLat) * 60.  X = (lon - centerLon) * 60 -- i.e. MINUTES OF LONGITUDE.
    VERIFIED IN-GAME (save GeoPosition vs mission ini, 2026-07-23): the game does NOT apply
    a cos(latitude) correction to X. Do not "fix" this back; it matches the engine.

    Dot-source this file to get the functions, or run it directly for a Fehmarn Belt demo:
        . .\Convert-SeaPowerPosition.ps1
        ConvertTo-SPPosition -Lat 54.30 -Lon 11.85 -CenterLat 54.55 -CenterLon 11.30

.NOTES
    The in-game Mission Editor writes these coordinates for you when you drag units on the
    map - use this script for geographic precision or scripted/bulk placement.
#>

function ConvertTo-SPPosition {
    <# Real lat/long -> RelativePositionInNM (X east, Z north). #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][double]$Lat,
        [Parameter(Mandatory)][double]$Lon,
        [Parameter(Mandatory)][double]$CenterLat,
        [Parameter(Mandatory)][double]$CenterLon,
        [object]$Y = 0,
        [string]$Name
    )
    $nmNorth = ($Lat - $CenterLat) * 60
    $nmEast  = ($Lon - $CenterLon) * 60
    $x = [math]::Round($nmEast, 2)
    $z = [math]::Round($nmNorth, 2)
    [pscustomobject]@{
        Name = $Name
        X    = $x
        Z    = $z
        Ini  = "RelativePositionInNM=$x,$Y,$z"
    }
}

function ConvertFrom-SPPosition {
    <# RelativePositionInNM (X east, Z north) -> real lat/long. #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][double]$X,
        [Parameter(Mandatory)][double]$Z,
        [Parameter(Mandatory)][double]$CenterLat,
        [Parameter(Mandatory)][double]$CenterLon
    )
    $lat = $CenterLat + $Z / 60
    $lon = $CenterLon + $X / 60
    [pscustomobject]@{
        Lat = [math]::Round($lat, 5)
        Lon = [math]::Round($lon, 5)
    }
}

function Convert-SPPlaces {
    <#
    Batch-convert a table of named places to offsets for one map centre.
    Pipe in objects/hashtables with Name, Lat, Lon (optional Y).
    Example:
        $center = @{ Lat = 54.55; Lon = 11.30 }
        @(
            @{ Name='Fehmarn south beach'; Lat=54.40; Lon=11.20 }
            @{ Name='Kadetrinne (WP start)'; Lat=54.30; Lon=11.85 }
            @{ Name='Puttgarden-Rodby ferry'; Lat=54.57; Lon=11.29 }
        ) | Convert-SPPlaces -CenterLat $center.Lat -CenterLon $center.Lon | Format-Table -Auto
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]$Place,
        [Parameter(Mandatory)][double]$CenterLat,
        [Parameter(Mandatory)][double]$CenterLon
    )
    process {
        ConvertTo-SPPosition -Lat $Place.Lat -Lon $Place.Lon -Y ($Place.Y ?? 0) `
            -CenterLat $CenterLat -CenterLon $CenterLon -Name $Place.Name
    }
}

# --- Demo when run directly (not dot-sourced) ---
if ($MyInvocation.InvocationName -ne '.') {
    Write-Host "Fehmarn Belt demo - map centre 54.55N, 11.30E`n" -ForegroundColor Cyan
    @(
        @{ Name = 'Fehmarn south beach (objective)'; Lat = 54.40; Lon = 11.20 }
        @{ Name = 'Player picket SE of Fehmarn';      Lat = 54.40; Lon = 11.29 }
        @{ Name = 'WP assault - Kadetrinne';          Lat = 54.30; Lon = 11.85 }
        @{ Name = 'Puttgarden-Rodby ferry lane';      Lat = 54.57; Lon = 11.29 }
        @{ Name = 'Warnemunde (GDR launch port)';     Lat = 54.18; Lon = 12.08 }
    ) | Convert-SPPlaces -CenterLat 54.55 -CenterLon 11.30 | Format-Table Name, X, Z, Ini -AutoSize
}
