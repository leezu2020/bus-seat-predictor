import pytest
import numpy as np
from app.ml.convolution import restore_pmf_from_14_intervals, discrete_convolve, compute_boarding_simulation

def test_pmf_normalization():
    """Verify that restore_pmf_from_14_intervals returns exactly sum = 1.0."""
    raw_probs = np.random.uniform(0.01, 1.0, 14)
    pmf = restore_pmf_from_14_intervals(raw_probs)
    
    assert len(pmf) == 46
    assert np.all(pmf >= 0.0)
    assert np.isclose(pmf.sum(), 1.0, atol=1e-6)

def test_boarding_monotonic_decrease_with_queue():
    """Verify that boarding success probability monotonically decreases as queue count increases."""
    # Synthetic PMF where most seats are around 5~15
    raw_probs = np.array([0.05, 0.05, 0.08, 0.1, 0.12, 0.15, 0.1, 0.08, 0.05, 0.04, 0.03, 0.08, 0.05, 0.02])
    pmf = restore_pmf_from_14_intervals(raw_probs)
    
    bus_pmfs = [pmf, pmf, pmf]
    
    prev_prob = 1.0
    for q in [0, 1, 3, 5, 8, 12, 20, 30]:
        res = compute_boarding_simulation(bus_pmfs, queue_count=q)
        p1 = res["first_bus_success_prob"]
        assert p1 <= prev_prob + 1e-6, f"Failed monotonicity at q={q}: {p1} > {prev_prob}"
        prev_prob = p1

def test_cumulative_bus_hierarchy():
    """Verify that P(B1) <= P(<=B2) <= P(<=B3)."""
    raw_probs = np.full(14, 1.0 / 14)
    pmf = restore_pmf_from_14_intervals(raw_probs)
    bus_pmfs = [pmf, pmf, pmf]
    
    res = compute_boarding_simulation(bus_pmfs, queue_count=7)
    p1 = res["first_bus_success_prob"]
    p2 = res["two_bus_cum_success_prob"]
    p3 = res["three_bus_cum_success_prob"]
    
    assert p1 <= p2 + 1e-6
    assert p2 <= p3 + 1e-6

def test_passed_buses_distribution_sum():
    """Verify that expected passed buses distribution sums to 1.0."""
    raw_probs = np.full(14, 1.0 / 14)
    pmf = restore_pmf_from_14_intervals(raw_probs)
    res = compute_boarding_simulation([pmf, pmf, pmf], queue_count=5)
    
    dist = res["passed_buses_distribution"]
    total_prob = dist["0"] + dist["1"] + dist["2"] + dist["3_or_more"]
    assert np.isclose(total_prob, 1.0, atol=1e-4)
