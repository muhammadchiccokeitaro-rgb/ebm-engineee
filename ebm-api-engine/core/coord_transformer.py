"""
coord_transformer.py
--------------------
Modul transformasi koordinat: WGS84 (lon, lat) -> UTM (easting, northing).

Digunakan untuk menyelaraskan koordinat dari file KMZ/KML (yang memakai
sistem global WGS84) dengan Block Model tambang yang menggunakan satuan
meter (UTM atau Local Grid).

Catatan untuk tambang di Indonesia:
  - Kebanyakan berada di Hemisphere S (Selatan khatulistiwa)
  - Zona UTM: 46S (Sumatera barat) hingga 54S (Papua timur)
  - Contoh: zona 51S untuk Kalimantan tengah

Referensi proyeksi:
  - EPSG:32600 + zone  = UTM North
  - EPSG:32700 + zone  = UTM South
"""

from typing import List, Tuple, Optional
from pyproj import Transformer


def auto_detect_utm_zone(lon: float, lat: float) -> Tuple[int, str]:
    """
    Hitung zona UTM dan hemisphere secara otomatis dari koordinat centroid.

    Args:
        lon: Longitude dalam derajat desimal (-180 hingga 180)
        lat: Latitude dalam derajat desimal (-90 hingga 90)

    Returns:
        Tuple (zone_number, hemisphere) contoh: (51, 'S')
    """
    zone_number = int((lon + 180) / 6) + 1
    if zone_number > 60:
        zone_number = 60
    hemisphere = 'N' if lat >= 0 else 'S'
    return zone_number, hemisphere


def get_epsg_code(utm_zone: int, hemisphere: str) -> int:
    """
    Hitung kode EPSG untuk proyeksi UTM berdasarkan zona dan hemisphere.

    EPSG:326xx = UTM North (xx = zona)
    EPSG:327xx = UTM South (xx = zona)
    """
    if hemisphere.upper() == 'N':
        return 32600 + utm_zone
    else:
        return 32700 + utm_zone


def wgs84_to_utm(
    lon: float,
    lat: float,
    utm_zone: Optional[int] = None,
    hemisphere: Optional[str] = None
) -> Tuple[float, float, int, str]:
    """
    Transformasikan satu titik dari WGS84 ke UTM.

    Args:
        lon: Longitude (derajat)
        lat: Latitude (derajat)
        utm_zone: Zona UTM (1-60). Jika None, auto-detect dari koordinat.
        hemisphere: 'N' atau 'S'. Jika None, auto-detect dari lat.

    Returns:
        Tuple (easting_m, northing_m, zone_used, hemisphere_used)
    """
    if utm_zone is None or hemisphere is None:
        detected_zone, detected_hemi = auto_detect_utm_zone(lon, lat)
        utm_zone = utm_zone or detected_zone
        hemisphere = hemisphere or detected_hemi

    epsg = get_epsg_code(utm_zone, hemisphere)
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    easting, northing = transformer.transform(lon, lat)
    return easting, northing, utm_zone, hemisphere


def transform_points(
    points: List[Tuple[float, float, float]],
    utm_zone: Optional[int] = None,
    hemisphere: Optional[str] = None
) -> Tuple[List[Tuple[float, float, float]], int, str]:
    """
    Transformasikan daftar titik (lon, lat, alt) -> (easting, northing, alt) dalam UTM.

    Auto-detect zona UTM dari centroid kumpulan titik jika zone tidak diberikan.

    Args:
        points: List (lon, lat, alt) dalam WGS84
        utm_zone: Opsional. Zona UTM override. Jika None, auto-detect.
        hemisphere: Opsional. 'N'/'S' override. Jika None, auto-detect.

    Returns:
        Tuple (utm_points, zone_used, hemisphere_used)
        di mana utm_points = List[(easting, northing, alt)]
    """
    if not points:
        return [], utm_zone or 0, hemisphere or 'S'

    if utm_zone is None or hemisphere is None:
        avg_lon = sum(p[0] for p in points) / len(points)
        avg_lat = sum(p[1] for p in points) / len(points)
        detected_zone, detected_hemi = auto_detect_utm_zone(avg_lon, avg_lat)
        utm_zone = utm_zone if utm_zone is not None else detected_zone
        hemisphere = hemisphere if hemisphere is not None else detected_hemi

    epsg = get_epsg_code(utm_zone, hemisphere)
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)

    utm_points = []
    for lon, lat, alt in points:
        easting, northing = transformer.transform(lon, lat)
        utm_points.append((easting, northing, alt))

    return utm_points, utm_zone, hemisphere


def transform_polygon_rings(
    rings: List[List[Tuple[float, float]]],
    utm_zone: int,
    hemisphere: str
) -> List[List[Tuple[float, float]]]:
    """
    Transformasikan daftar ring polygon (lon, lat) -> (easting, northing) UTM.

    Args:
        rings: List of ring. Setiap ring adalah list (lon, lat).
        utm_zone: Zona UTM.
        hemisphere: 'N' atau 'S'.

    Returns:
        List of ring dalam koordinat UTM (easting, northing).
    """
    if not rings:
        return []

    epsg = get_epsg_code(utm_zone, hemisphere)
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)

    utm_rings = []
    for ring in rings:
        utm_ring = []
        for lon, lat in ring:
            e, n = transformer.transform(lon, lat)
            utm_ring.append((e, n))
        utm_rings.append(utm_ring)

    return utm_rings
