"""
===========================================================================
  CORE/DEM_PROCESSOR.PY - Auto-Topography Processor
===========================================================================
  Provides isolated functions for:
    1. Extracting a bounding box from a Block Model DataFrame (X, Y columns)
    2. Clipping a DEM raster to that bounding box using rasterio windowed reads
    3. Returning a cleaned elevation grid as a 2D Python list
===========================================================================
"""

import io
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any, Optional


def extract_bbox_from_csv(
    df: pd.DataFrame,
    x_col: str = "X",
    y_col: str = "Y",
    padding_pct: float = 0.05,
) -> Tuple[float, float, float, float]:
    """
    Extract a padded bounding box from the block model's X, Y columns.

    Args:
        df          : Block model DataFrame (must contain X and Y columns)
        x_col       : Name of the easting column
        y_col       : Name of the northing column
        padding_pct : Fractional padding around the raw bbox (default: 5 percent)

    Returns:
        (min_x, min_y, max_x, max_y) with padding applied
    """
    col_upper = {c.upper(): c for c in df.columns}
    x_key = col_upper.get(x_col.upper())
    y_key = col_upper.get(y_col.upper())

    if x_key is None or y_key is None:
        raise ValueError(
            f"Block model CSV must contain '{x_col}' and '{y_col}' columns. "
            f"Found columns: {list(df.columns)}"
        )

    xs = df[x_key].dropna().astype(float)
    ys = df[y_key].dropna().astype(float)

    if xs.empty or ys.empty:
        raise ValueError("Block model contains no valid X or Y coordinate values.")

    raw_min_x, raw_max_x = float(xs.min()), float(xs.max())
    raw_min_y, raw_max_y = float(ys.min()), float(ys.max())

    pad_x = (raw_max_x - raw_min_x) * padding_pct
    pad_y = (raw_max_y - raw_min_y) * padding_pct

    return raw_min_x - pad_x, raw_min_y - pad_y, raw_max_x + pad_x, raw_max_y + pad_y


def _fill_nan(arr: np.ndarray) -> np.ndarray:
    """Fill NaN in 2D array via forward/backward fill along rows then columns."""
    result = arr.copy()
    rows, cols = result.shape

    for r in range(rows):
        row = result[r]
        mask = np.isnan(row)
        if mask.all():
            continue
        idx = np.where(~mask, np.arange(cols), 0)
        np.maximum.accumulate(idx, out=idx)
        result[r] = row[idx]

    for r in range(rows):
        row = result[r]
        mask = np.isnan(row)
        if not mask.any():
            continue
        idx = np.where(~mask, np.arange(cols), cols - 1)
        idx = np.minimum.accumulate(idx[::-1])[::-1]
        result[r] = row[idx]

    for c in range(cols):
        col = result[:, c]
        mask = np.isnan(col)
        if mask.all():
            result[:, c] = 0.0
            continue
        idx = np.where(~mask, np.arange(rows), 0)
        np.maximum.accumulate(idx, out=idx)
        result[:, c] = col[idx]

    return result


def clip_dem_to_bbox(
    dem_bytes: bytes,
    bbox: Tuple[float, float, float, float],
    filename: str = "dem.tif",
    band_index: int = 1,
    max_cells: int = 512,
) -> Dict[str, Any]:
    """
    Open a DEM raster from bytes and clip it to the given bounding box
    using rasterio windowed read (no disk I/O required).

    Returns dict with elevation_grid, rows, cols, extent, center_x/y, cell_width/height, nodata_value.
    """
    try:
        import rasterio
        from rasterio.io import MemoryFile
        from rasterio.windows import from_bounds
        from rasterio.enums import Resampling
    except ImportError:
        raise ImportError("rasterio not installed. Run: pip install rasterio")

    min_x, min_y, max_x, max_y = bbox

    try:
        with MemoryFile(dem_bytes) as memfile:
            with memfile.open() as src:
                nodata = src.nodata
                window = from_bounds(left=min_x, bottom=min_y, right=max_x, top=max_y, transform=src.transform)

                win_width = window.width
                win_height = window.height

                if win_width <= 0 or win_height <= 0:
                    raise ValueError(
                        f"Bounding box Block Model tidak berpotongan dengan area DEM raster. "
                        f"Extent raster: {src.bounds}. "
                        f"Pastikan Block Model dan DEM berada di area yang sama."
                    )

                scale = min(1.0, max_cells / max(win_width, win_height))
                out_cols = max(2, int(win_width * scale))
                out_rows = max(2, int(win_height * scale))

                elevation = src.read(
                    band_index,
                    window=window,
                    out_shape=(out_rows, out_cols),
                    resampling=Resampling.bilinear,
                ).astype(np.float64)

    except ImportError:
        raise
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Gagal membuka raster '{filename}': {exc}")

    if nodata is not None:
        elevation[elevation == nodata] = np.nan
    elevation[elevation < -9000] = np.nan

    if np.any(np.isnan(elevation)):
        elevation = _fill_nan(elevation)

    cell_width = (max_x - min_x) / out_cols
    cell_height = (max_y - min_y) / out_rows
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    valid_elev = elevation[~np.isnan(elevation)]
    min_z = float(valid_elev.min()) if valid_elev.size > 0 else 0.0
    max_z = float(valid_elev.max()) if valid_elev.size > 0 else 1.0

    return {
        "elevation_grid": elevation.tolist(),
        "rows": out_rows,
        "cols": out_cols,
        "extent": {
            "min_x": float(min_x),
            "max_x": float(max_x),
            "min_y": float(min_y),
            "max_y": float(max_y),
            "min_z": min_z,
            "max_z": max_z,
        },
        "center_x": center_x,
        "center_y": center_y,
        "cell_width": cell_width,
        "cell_height": cell_height,
        "nodata_value": nodata,
    }
