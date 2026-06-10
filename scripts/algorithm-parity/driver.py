"""Parity driver: runs the ORIGINAL Python program code in `26_PR Program/src`
(unmodified) against scripts/algorithm-parity/field.csv + config.json and dumps
every division assignment / payout to python-output.json for comparison with the
TypeScript port.

matplotlib/scipy are stubbed (only numpy is required): with png=False the program
never plots, and scipy's norm.pdf feeds chart points only, never division math.

Usage: python scripts/algorithm-parity/driver.py
"""

import csv
import json
import math
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "..", "26_PR Program", "src"))
sys.path.insert(0, SRC)

import numpy as np  # noqa: E402

# ---- stub plotting/scipy modules so the original imports succeed ----
_mpl = types.ModuleType("matplotlib")
_plt = types.ModuleType("matplotlib.pyplot")
_mpl.pyplot = _plt
sys.modules.setdefault("matplotlib", _mpl)
sys.modules.setdefault("matplotlib.pyplot", _plt)


class _Norm:
    @staticmethod
    def pdf(x, loc=0.0, scale=1.0):
        x = np.asarray(x, dtype=float)
        z = (x - loc) / scale
        return np.exp(-0.5 * z * z) / (scale * np.sqrt(2.0 * np.pi))

    @staticmethod
    def cdf(x, loc=0.0, scale=1.0):
        x = np.asarray(x, dtype=float)
        return 0.5 * (1.0 + np.vectorize(math.erf)((x - loc) / (scale * math.sqrt(2.0))))


_scipy = types.ModuleType("scipy")
_scipy_stats = types.ModuleType("scipy.stats")
_scipy_integrate = types.ModuleType("scipy.integrate")
_scipy_stats.norm = _Norm()
_scipy.stats = _scipy_stats
_scipy.integrate = _scipy_integrate
sys.modules.setdefault("scipy", _scipy)
sys.modules.setdefault("scipy.stats", _scipy_stats)
sys.modules.setdefault("scipy.integrate", _scipy_integrate)

import peer_racing_algorithm as pr  # noqa: E402
import master_calculator as mc  # noqa: E402


def load_prealgorithm():
    """prealgorithm.py has package-relative imports that don't resolve standalone;
    exec its source with those import lines removed so the original logic runs."""
    path = os.path.join(SRC, "prealgorithm.py")
    with open(path, "r") as f:
        src_text = f.read()
    for line in (
        "from .peer_racing_algorithm import load_entries # Modified import",
        "from .peer_racing_algorithm import Entry # Modified import",
        "from .config import post_parse # Modified import",
    ):
        src_text = src_text.replace(line, "")
    mod = types.ModuleType("prealgorithm_patched")
    mod.__dict__["__name__"] = "prealgorithm_patched"
    exec(compile(src_text, path, "exec"), mod.__dict__)
    return mod


def serialize_winners(winners):
    return {div: [e.id for e in runners] for div, runners in winners.items()}


def main():
    with open(os.path.join(HERE, "config.json"), "r") as f:
        config = json.load(f)

    with open(os.path.join(HERE, "field.csv"), "r") as f:
        entries = pr.parse_entries(config, csv.reader(f))

    # state.sort_entries
    entries.sort(key=lambda x: x.time_s)
    for i, e in enumerate(entries):
        e.overall_rank = i + 1

    total = len(entries)
    auto = config["divisions"]["auto_set_divisions"]
    payout_slots = mc.calclulate_num_payout_slots(total) if auto else config["divisions"]["payout_slots"]
    divisions = mc.calclulate_num_divisions(total) if auto else config["divisions"]["divisions"]

    rf = mc.RaceFinances(
        config["entry_fee"], total, config["processing_fee_pct"], config["pr_holding_pct"],
        config["promoter_split_pct"], config["added_money"], config["d1_adjustment"],
        config["incentive_division1"], config["incentive_division2"], config["incentive_division3"],
        payout_slots=payout_slots, divisions=divisions,
    )

    winners, divisions_h = pr.run(entries, config, rf)
    main_run = {"divisionsH": list(divisions_h), "winners": serialize_winners(winners)}

    incentive_runs = []
    for i, ic in enumerate(rf.incentive_divisions):
        crit = ic.criteria
        if crit == "female":
            subset = [e for e in entries if e.is_female()]
        elif crit == "military":
            subset = [e for e in entries if e.is_military()]
        elif isinstance(crit, list) and crit[0] in ("over", "under"):
            limit = int(crit[1])
            subset = [e for e in entries if (e.age >= limit if crit[0] == "over" else e.age <= limit)]
        else:
            subset = []
        w, dh = pr.run(subset, config, rf, incentive_run=i)
        incentive_runs.append({
            "criteria": ic.name(),
            "subsetIds": [e.id for e in subset],
            "divisionsH": list(dh),
            "winners": serialize_winners(w),
        })

    prealg = load_prealgorithm()
    low_p, high_p = prealg.run(entries)

    out = {
        "totals": {"runners": total, "payoutSlots": payout_slots, "divisions": divisions},
        "finances": {
            "grossEntryFees": rf.gross_entry_fees,
            "totalProcessingFees": rf.total_processing_fees,
            "netEntryFees": rf.net_entry_fees,
            "prHolding": rf.pr_holding,
            "promoterProfit": rf.promoter_profit,
            "prProfit": rf.pr_profit,
            "totalPurse": rf.total_purse,
            "incentiveDivisionPurse": rf.incentive_division_purse,
            "finalRacersPurse": rf.final_racers_purse,
            "payoutStructure": rf.payout_structure,
            "totalPayout": rf.total_payout,
            "incentives": [
                {"name": ic.name(), "totalPayout": ic.total_payout, "payoutStructure": ic.payout_structure}
                for ic in rf.incentive_divisions
            ],
        },
        "preAlgorithm": {"lowPercentileCutoff": low_p, "highPercentileCutoff": high_p},
        "main": main_run,
        "incentiveRuns": incentive_runs,
        "entries": [
            {
                "id": e.id,
                "timeS": e.time_s,
                "overallRank": e.overall_rank,
                "peerRacingRank": e.peer_racing_rank,
                "payout": e.payout,
                "incentivePayout1": e.incentive_payout1,
                "incentivePayout2": e.incentive_payout2,
                "incentivePayout3": e.incentive_payout3,
                "sex": e.sex,
                "age": e.age,
                "military": e.is_military(),
            }
            for e in entries
        ],
    }

    out_path = os.path.join(HERE, "python-output.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote %s (%d entries)" % (out_path, total))


if __name__ == "__main__":
    main()
