"""
kmz_parser.py
-------------
Modul untuk mem-parse file KMZ/KML dan mengekstrak geometri
(polygon, linestring, point) ke dalam format titik X,Y,Z.

KMZ = ZIP file berisi .kml + aset lainnya.
KML = XML-based geospatial format dari Google Earth.

Koordinat KML: longitude, latitude, altitude (WGS84)
Output:
  - topo_points: list (lon, lat, alt) dari Point & LineString → triangulasi topografi
  - pit_polygons: list polygon rings [(lon, lat), ...] dari Polygon → batas pit
  - metadata: dict berisi info file (nama layer, jumlah titik, dll)
"""

import zipfile
import io
from typing import List, Tuple, Dict, Any, Optional
from lxml import etree

# Namespace KML
KML_NS = "http://www.opengis.net/kml/2.2"
KML_NS_OLD = "http://earth.google.com/kml/2.1"


def _parse_coord_string(coord_str: str) -> List[Tuple[float, float, float]]:
    """
    Parse string koordinat KML: "lon,lat,alt lon,lat,alt ..."
    Altitude bisa tidak ada (default 0).
    """
    points = []
    for token in coord_str.strip().split():
        parts = token.strip().split(",")
        if len(parts) >= 2:
            try:
                lon = float(parts[0])
                lat = float(parts[1])
                alt = float(parts[2]) if len(parts) >= 3 else 0.0
                points.append((lon, lat, alt))
            except ValueError:
                continue
    return points


def _get_tag_local(elem: etree._Element) -> str:
    """Kembalikan tag tanpa namespace prefix, misal '{ns}Polygon' -> 'Polygon'."""
    tag = elem.tag
    if '{' in tag:
        return tag.split('}', 1)[1]
    return tag


def _find_all_ns(root: etree._Element, local_name: str) -> List[etree._Element]:
    """Cari semua elemen dengan local tag name, tanpa peduli namespace."""
    results = []
    for elem in root.iter():
        if _get_tag_local(elem) == local_name:
            results.append(elem)
    return results


def _extract_ring_coords(coords_elem: etree._Element) -> List[Tuple[float, float]]:
    """Ekstrak koordinat ring polygon: return list (lon, lat) tanpa altitude."""
    pts_3d = _parse_coord_string(coords_elem.text or "")
    return [(lon, lat) for lon, lat, _alt in pts_3d]


def _extract_geometry_from_kml(
    root: etree._Element
) -> Dict[str, Any]:
    """
    Pisahkan tipe geometri dari KML tree:
      - Point & LineString  -> topo_points [(lon, lat, alt), ...]
      - Polygon (outer ring) -> pit_polygons [[(lon, lat), ...], ...]

    Juga kumpulkan metadata dari elemen <name> dan <description>.
    """
    topo_points: List[Tuple[float, float, float]] = []
    pit_polygons: List[List[Tuple[float, float]]] = []
    placemark_names: List[str] = []

    # Iterasi semua Placemark
    for placemark in _find_all_ns(root, 'Placemark'):
        # Ambil nama Placemark jika ada
        name_elems = _find_all_ns(placemark, 'name')
        name = name_elems[0].text.strip() if name_elems and name_elems[0].text else ""
        if name:
            placemark_names.append(name)

        # --- Point ---
        for point_elem in _find_all_ns(placemark, 'Point'):
            for coord_elem in _find_all_ns(point_elem, 'coordinates'):
                pts = _parse_coord_string(coord_elem.text or "")
                topo_points.extend(pts)

        # --- LineString ---
        for ls_elem in _find_all_ns(placemark, 'LineString'):
            for coord_elem in _find_all_ns(ls_elem, 'coordinates'):
                pts = _parse_coord_string(coord_elem.text or "")
                topo_points.extend(pts)

        # --- MultiGeometry: rekursif ---
        for mg_elem in _find_all_ns(placemark, 'MultiGeometry'):
            sub = _extract_geometry_from_kml(mg_elem)
            topo_points.extend(sub['topo_points'])
            pit_polygons.extend(sub['pit_polygons'])

        # --- Polygon ---
        for poly_elem in _find_all_ns(placemark, 'Polygon'):
            # Ambil outer boundary saja (LinearRing pertama di outerBoundaryIs)
            outer_rings = _find_all_ns(poly_elem, 'outerBoundaryIs')
            if outer_rings:
                for linear_ring in _find_all_ns(outer_rings[0], 'LinearRing'):
                    for coord_elem in _find_all_ns(linear_ring, 'coordinates'):
                        ring = _extract_ring_coords(coord_elem)
                        if len(ring) >= 3:
                            pit_polygons.append(ring)
            else:
                # Fallback: langsung cari LinearRing di dalam Polygon
                for linear_ring in _find_all_ns(poly_elem, 'LinearRing'):
                    for coord_elem in _find_all_ns(linear_ring, 'coordinates'):
                        ring = _extract_ring_coords(coord_elem)
                        if len(ring) >= 3:
                            pit_polygons.append(ring)

    # Fallback: Jika tidak ada titik topografi (Point/LineString) yang ditemukan,
    # ambil brute-force SEMUA tag <coordinates> di seluruh file KML sebagai topografi.
    # Ini sesuai dengan logika pencarian tag coordinates secara langsung.
    if not topo_points:
        for coord_elem in _find_all_ns(root, 'coordinates'):
            pts = _parse_coord_string(coord_elem.text or "")
            topo_points.extend(pts)

    return {
        'topo_points': topo_points,
        'pit_polygons': pit_polygons,
        'metadata': {
            'placemark_names': placemark_names,
            'topo_point_count': len(topo_points),
            'polygon_count': len(pit_polygons),
        }
    }


def _extract_coords_from_element(root: etree._Element) -> List[Tuple[float, float, float]]:
    """
    [BACKWARD COMPAT] Rekursif cari semua elemen <coordinates> di dalam KML tree.
    Support namespace KML 2.1 dan 2.2.
    """
    all_points = []
    for ns in [KML_NS, KML_NS_OLD, ""]:
        tag = f"{{{ns}}}coordinates" if ns else "coordinates"
        for elem in root.iter(tag):
            text = elem.text
            if text:
                pts = _parse_coord_string(text)
                all_points.extend(pts)
    return all_points


def parse_kml_bytes(kml_bytes: bytes) -> List[Tuple[float, float, float]]:
    """
    [BACKWARD COMPAT] Parse raw KML bytes. Return list koordinat (lon, lat, alt).
    Gunakan parse_kml_bytes_rich() untuk output dengan pemisahan tipe geometri.
    """
    try:
        root = etree.fromstring(kml_bytes)
    except etree.XMLSyntaxError as e:
        raise ValueError(f"KML XML tidak valid: {e}")

    points = _extract_coords_from_element(root)

    if not points:
        raise ValueError(
            "Tidak ada koordinat ditemukan dalam file KML. "
            "Pastikan file berisi Polygon, LineString, atau Point."
        )

    return points


def parse_kml_bytes_rich(kml_bytes: bytes) -> Dict[str, Any]:
    """
    Parse raw KML bytes dengan pemisahan tipe geometri.

    Returns:
        Dict dengan key:
          - topo_points: [(lon, lat, alt), ...]  — untuk triangulasi topografi
          - pit_polygons: [[(lon, lat), ...], ...]  — untuk batas pit
          - metadata: dict info file
    """
    try:
        root = etree.fromstring(kml_bytes)
    except etree.XMLSyntaxError as e:
        raise ValueError(f"KML XML tidak valid: {e}")

    result = _extract_geometry_from_kml(root)

    if not result['topo_points'] and not result['pit_polygons']:
        raise ValueError(
            "Tidak ada koordinat ditemukan dalam file KML. "
            "Pastikan file berisi Polygon, LineString, atau Point."
        )

    return result


def parse_kmz_bytes(kmz_bytes: bytes) -> List[Tuple[float, float, float]]:
    """
    [BACKWARD COMPAT] Parse file KMZ (ZIP yang berisi .kml).
    Gunakan parse_kmz_bytes_rich() untuk output dengan pemisahan tipe geometri.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(kmz_bytes)) as zf:
            kml_files = [name for name in zf.namelist() if name.lower().endswith(".kml")]

            if not kml_files:
                raise ValueError("Tidak ada file .kml ditemukan di dalam .kmz")

            all_points = []
            for kml_name in kml_files:
                kml_data = zf.read(kml_name)
                try:
                    pts = parse_kml_bytes(kml_data)
                    all_points.extend(pts)
                except ValueError:
                    continue

            if not all_points:
                raise ValueError("Tidak ada koordinat ditemukan di dalam file KMZ.")

            return all_points

    except zipfile.BadZipFile:
        raise ValueError("File bukan format ZIP/KMZ yang valid.")


def parse_kmz_bytes_rich(kmz_bytes: bytes) -> Dict[str, Any]:
    """
    Parse file KMZ dengan pemisahan tipe geometri (topografi vs pit polygon).

    Returns:
        Dict dengan key:
          - topo_points: [(lon, lat, alt), ...]
          - pit_polygons: [[(lon, lat), ...], ...]
          - metadata: dict info file
    """
    try:
        with zipfile.ZipFile(io.BytesIO(kmz_bytes)) as zf:
            kml_files = [name for name in zf.namelist() if name.lower().endswith(".kml")]

            if not kml_files:
                raise ValueError("Tidak ada file .kml ditemukan di dalam .kmz")

            merged: Dict[str, Any] = {
                'topo_points': [],
                'pit_polygons': [],
                'metadata': {
                    'placemark_names': [],
                    'topo_point_count': 0,
                    'polygon_count': 0,
                    'kml_files': kml_files,
                }
            }

            for kml_name in kml_files:
                kml_data = zf.read(kml_name)
                try:
                    result = parse_kml_bytes_rich(kml_data)
                    merged['topo_points'].extend(result['topo_points'])
                    merged['pit_polygons'].extend(result['pit_polygons'])
                    merged['metadata']['placemark_names'].extend(
                        result['metadata'].get('placemark_names', [])
                    )
                except ValueError:
                    continue

            merged['metadata']['topo_point_count'] = len(merged['topo_points'])
            merged['metadata']['polygon_count'] = len(merged['pit_polygons'])

            if not merged['topo_points'] and not merged['pit_polygons']:
                raise ValueError("Tidak ada koordinat ditemukan di dalam file KMZ.")

            return merged

    except zipfile.BadZipFile:
        raise ValueError("File bukan format ZIP/KMZ yang valid.")


def extract_points_from_kmz_or_kml(file_bytes: bytes, filename: str) -> List[Tuple[float, float, float]]:
    """
    [BACKWARD COMPAT] Entry point lama. Deteksi otomatis KMZ/KML.
    Return list (lon, lat, alt). Gunakan extract_rich() untuk output lengkap.
    """
    name_lower = filename.lower()
    if name_lower.endswith(".kmz"):
        return parse_kmz_bytes(file_bytes)
    elif name_lower.endswith(".kml"):
        return parse_kml_bytes(file_bytes)
    else:
        if file_bytes[:2] == b"PK":
            return parse_kmz_bytes(file_bytes)
        else:
            return parse_kml_bytes(file_bytes)


def extract_rich_from_kmz_or_kml(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Entry point utama dengan pemisahan geometri.
    Deteksi otomatis apakah file adalah KMZ atau KML.

    Returns:
        Dict dengan:
          - topo_points: [(lon, lat, alt), ...]  — titik elevasi topografi
          - pit_polygons: [[(lon, lat), ...], ...]  — polygon batas pit
          - metadata: dict info file
    """
    name_lower = filename.lower()
    if name_lower.endswith(".kmz"):
        return parse_kmz_bytes_rich(file_bytes)
    elif name_lower.endswith(".kml"):
        return parse_kml_bytes_rich(file_bytes)
    else:
        if file_bytes[:2] == b"PK":
            return parse_kmz_bytes_rich(file_bytes)
        else:
            return parse_kml_bytes_rich(file_bytes)
