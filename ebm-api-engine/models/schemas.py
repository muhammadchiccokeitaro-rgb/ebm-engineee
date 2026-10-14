from typing import Literal, Optional
from pydantic import BaseModel, Field

class FinancialParameters(BaseModel):
    commodity_price: float = Field(..., description="Harga komoditas per unit (misal: USD/ton atau USD/oz)")
    ore_mining_cost: float = Field(..., description="Biaya penambangan bijih (USD/ton)")
    waste_mining_cost: float = Field(..., description="Biaya penambangan batuan penutup/waste (USD/ton)")
    processing_cost: float = Field(..., description="Biaya pemrosesan pabrik (USD/ton)")
    selling_cost: float = Field(..., description="Biaya penjualan & G&A (USD/ton)")
    metallurgical_recovery: float = Field(..., description="Persentase perolehan metalurgi (0.0 - 1.0)")
    osa: float = Field(..., description="Overall Slope Angle (derajat) — digunakan saat geon_mapping tidak ada")
    cut_off_grade: float = Field(0.5, description="Batas kadar minimum untuk diklasifikasikan sebagai Ore")
    grade_unit: Literal["fraction", "percent", "g_per_t", "ppm"] = "g_per_t"
    price_unit: Literal["per_t_metal", "per_kg", "per_gram", "per_troy_oz"] = "per_gram"
    currency: str = "IDR"
    geon_mapping: Optional[dict[str, float]] = Field(None, description="Pemetaan OSA per RockType untuk GEON Mode (Gigi 2). Jika None, fallback ke osa global.")
    revenue_factors: Optional[list[float]] = Field([1.0], description="List of Revenue Factors for Nested Pits")
    min_mining_width: Optional[float] = Field(
        None,
        description="Lebar bukaan minimum operasional dalam meter; belum diterapkan ke pipeline.",
    )
    min_pushback_tonnage: Optional[float] = Field(
        None,
        description="Tonase minimum per fase operasional; belum diterapkan ke pipeline.",
    )
    production_capacity_tpy: Optional[float] = Field(
        None,
        gt=0,
        allow_inf_nan=False,
        description="Kapasitas produksi bijih per tahun untuk evaluasi NPV indikatif.",
    )
    discount_rate: Optional[float] = Field(
        0.0,
        ge=0,
        le=1,
        allow_inf_nan=False,
        description="Tingkat diskonto tahunan; dipakai hanya bila pit selection diaktifkan.",
    )
    mining_capacity_tpy: Optional[float] = Field(
        None,
        gt=0,
        allow_inf_nan=False,
        description="Kapasitas penambangan tahunan; dicatat tetapi tidak diterapkan pada v1.",
    )

class OptimizationSummary(BaseModel):
    total_ore_tonnage: float
    total_waste_tonnage: float
    stripping_ratio: float
    total_npv: float
    total_undiscounted_value: float = Field(0.0, description="Total Undiscounted Pit Value")

