"""Indicative NPV ranking for existing Revenue Factor nested pits.

Cash flow is discounted at the end of each year. Mining-year numbering starts
at year 1, including waste mined before the first ore block. This is an
indicative sequencing calculation, not a mine schedule or geotechnical check.
"""

import math
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd


def _validate_positive_finite(name: str, value: Any) -> float:
    if isinstance(value, (bool, np.bool_)):
        raise ValueError(f"{name} must be a finite number greater than zero.")
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(f"{name} must be a finite number greater than zero.") from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f"{name} must be a finite number greater than zero.")
    return number


def _validated_discount_rate(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (bool, np.bool_)):
        raise ValueError("discount_rate must be finite and between 0 and 1 inclusive.")
    try:
        rate = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("discount_rate must be finite and between 0 and 1 inclusive.") from exc
    if not math.isfinite(rate) or not 0 <= rate <= 1:
        raise ValueError("discount_rate must be finite and between 0 and 1 inclusive.")
    return rate


def _schedule_order(
    ordered_positions: list[int],
    destinations: np.ndarray,
    tonnage: np.ndarray,
    bev: np.ndarray,
    production_capacity_tpy: float,
    discount_rate: float,
) -> tuple[int, float]:
    cumulative_ore_tonnage = 0.0
    cash_flow_by_year: dict[int, float] = {}

    for position in ordered_positions:
        if destinations[position] == "Ore":
            cumulative_ore_tonnage += tonnage[position]
            if not math.isfinite(cumulative_ore_tonnage):
                raise ValueError("Cumulative ore tonnage must remain finite.")

        year = max(1, math.ceil(cumulative_ore_tonnage / production_capacity_tpy))
        cash_flow_by_year[year] = cash_flow_by_year.get(year, 0.0) + bev[position]

    mine_life_years = max(cash_flow_by_year, default=0)
    if discount_rate and discount_rate > 0:
        # Untuk tahun yang sangat jauh, (1+r)^year meledak → kontribusi NPV ≈ 0, aman di-skip
        _MAX_YEAR = int(math.log(1e300) / math.log(1.0 + discount_rate))
        npv = math.fsum(
            cash_flow / ((1.0 + discount_rate) ** year)
            for year, cash_flow in cash_flow_by_year.items()
            if year <= _MAX_YEAR
        )
    else:
        npv = math.fsum(cash_flow_by_year.values())

    return mine_life_years, float(npv)


def calculate_pit_selection(
    df: pd.DataFrame,
    rf_scenarios: Mapping[float, pd.DataFrame],
    production_capacity_tpy: float,
    discount_rate: float | None = 0.0,
    mining_capacity_tpy: float | None = None,
) -> dict[str, Any]:
    """Rank RF pits using indicative best- and worst-case production orders.

    ``df`` supplies final ``First_RF`` membership and row order. Each scenario
    frame supplies RF-specific BEV, Destination, and Tonase calculated by the
    existing economic pipeline. This function does not add an economic formula.

    Best order: First_RF ascending, Z descending, then row position ascending.
    Worst order: Z descending, then row position ascending. Cash flow is
    discounted at each year end, with the first mining year numbered 1.
    Cumulative ore tonnage determines the year of each block; waste uses the
    cumulative ore tonnage at its position. Precedence is assumed from nested
    closure and top-down Z order, but the graph is not revalidated here.
    """
    production_capacity = _validate_positive_finite(
        "production_capacity_tpy", production_capacity_tpy
    )
    rate = _validated_discount_rate(discount_rate)
    if mining_capacity_tpy is not None:
        mining_capacity = _validate_positive_finite("mining_capacity_tpy", mining_capacity_tpy)
    else:
        mining_capacity = None

    required_columns = {"First_RF", "Z", "Tonase"}
    missing_columns = sorted(required_columns.difference(df.columns))
    if missing_columns:
        raise ValueError(f"Missing pit-selection columns: {missing_columns}.")
    if not isinstance(rf_scenarios, Mapping):
        raise ValueError("rf_scenarios must map each RF value to its RF-specific DataFrame.")

    assumptions = {
        "discount_convention": "End-of-year discounting; year numbering starts at 1.",
        "mining_capacity_tpy": mining_capacity,
        "mining_capacity_applied": False,
        "capex_included": False,
        "precedence_assumption": (
            "RF shells are nested/precedence-closed; Z-descending order processes "
            "higher-Z predecessors before lower-Z sources. The graph is not revalidated here."
        ),
        "bev_source": "BEV, Destination, and Tonase are valued from the RF=1.0 optimizer snapshot.",
        "valuation_basis": "base_price (RF=1.0)",
    }

    if df.empty:
        return {
            "candidates": [],
            "recommendation": {
                "best_case_rf": None,
                "worst_case_rf": None,
                "recommendations_differ": False,
            },
            "assumptions": assumptions,
            "valuation_basis": "base_price (RF=1.0)",
        }

    first_rf = pd.to_numeric(df["First_RF"], errors="coerce").to_numpy(dtype=float)
    z = pd.to_numeric(df["Z"], errors="coerce").to_numpy(dtype=float)
    source_tonnage = pd.to_numeric(df["Tonase"], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(first_rf).all() or (first_rf < 0).any():
        raise ValueError("First_RF must contain finite non-negative values.")
    if not np.isfinite(z).all():
        raise ValueError("Z must contain finite values for pit-selection ordering.")
    if not np.isfinite(source_tonnage).all() or (source_tonnage < 0).any():
        raise ValueError("Source Tonase must be finite and non-negative.")

    candidate_rfs = []
    scenario_arrays = {}
    for raw_rf, scenario in rf_scenarios.items():
        rf = _validate_positive_finite("RF candidate", raw_rf)
        if rf in scenario_arrays:
            raise ValueError(f"Duplicate RF candidate: {rf}.")
        if not isinstance(scenario, pd.DataFrame):
            raise ValueError(f"RF {rf} scenario must be a pandas DataFrame.")
        if len(scenario) != len(df) or not scenario.index.equals(df.index):
            raise ValueError(f"RF {rf} scenario rows/index must match the source DataFrame.")

        scenario_columns = {"BEV", "Destination", "Tonase"}
        missing_scenario_columns = sorted(scenario_columns.difference(scenario.columns))
        if missing_scenario_columns:
            raise ValueError(
                f"RF {rf} scenario is missing columns: {missing_scenario_columns}."
            )

        bev = pd.to_numeric(scenario["BEV"], errors="coerce").to_numpy(dtype=float)
        tonnage = pd.to_numeric(scenario["Tonase"], errors="coerce").to_numpy(dtype=float)
        destinations = scenario["Destination"].to_numpy()
        if not np.isfinite(bev).all():
            raise ValueError(f"BEV values for RF {rf} must be finite.")
        if not np.isfinite(tonnage).all() or (tonnage < 0).any():
            raise ValueError(f"Tonase values for RF {rf} must be finite and non-negative.")

        scenario_arrays[rf] = (bev, destinations, tonnage)
        candidate_rfs.append(rf)

    if 1.0 not in scenario_arrays:
        raise ValueError("Pit selection requires an RF=1.0 base-price snapshot.")
    base_bev, base_destinations, base_tonnage = scenario_arrays[1.0]

    candidates = []
    for rf in sorted(candidate_rfs):
        pit_positions = np.flatnonzero((first_rf > 0) & (first_rf <= rf)).tolist()
        bev = base_bev
        destinations = base_destinations
        tonnage = base_tonnage

        if pit_positions:
            pit_destinations = destinations[pit_positions]
            if not np.isin(pit_destinations, ("Ore", "Waste")).all():
                raise ValueError(f"Destination for mined blocks at RF {rf} must be 'Ore' or 'Waste'.")
            ore_tonnes = float(sum(
                tonnage[position]
                for position in pit_positions
                if destinations[position] == "Ore"
            ))
            waste_tonnes = float(sum(
                tonnage[position]
                for position in pit_positions
                if destinations[position] == "Waste"
            ))
            undiscounted_value = float(sum(bev[position] for position in pit_positions))

            best_order = sorted(
                pit_positions,
                key=lambda position: (first_rf[position], -z[position], position),
            )
            worst_order = sorted(pit_positions, key=lambda position: (-z[position], position))
            life_best, npv_best = _schedule_order(
                best_order, destinations, tonnage, bev, production_capacity, rate
            )
            life_worst, npv_worst = _schedule_order(
                worst_order, destinations, tonnage, bev, production_capacity, rate
            )
        else:
            ore_tonnes = 0.0
            waste_tonnes = 0.0
            undiscounted_value = 0.0
            life_best = life_worst = 0
            npv_best = npv_worst = 0.0

        candidates.append({
            "rf": rf,
            "undiscounted_value": undiscounted_value,
            "ore_tonnes": ore_tonnes,
            "waste_tonnes": waste_tonnes,
            "stripping_ratio": waste_tonnes / ore_tonnes if ore_tonnes > 0 else 0.0,
            "mine_life_years": {"best": life_best, "worst": life_worst},
            "npv_best": npv_best,
            "npv_worst": npv_worst,
        })

    if candidates:
        best_candidate = max(candidates, key=lambda candidate: candidate["npv_best"])
        worst_candidate = max(candidates, key=lambda candidate: candidate["npv_worst"])
        recommendation = {
            "best_case_rf": best_candidate["rf"],
            "worst_case_rf": worst_candidate["rf"],
            "recommendations_differ": best_candidate["rf"] != worst_candidate["rf"],
        }
    else:
        recommendation = {
            "best_case_rf": None,
            "worst_case_rf": None,
            "recommendations_differ": False,
        }

    return {
        "candidates": candidates,
        "recommendation": recommendation,
        "assumptions": assumptions,
        "valuation_basis": "base_price (RF=1.0)",
    }