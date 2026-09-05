import numpy as np
from typing import List, Dict, Any, Tuple

MAX_SEATS = 45

def restore_pmf_from_14_intervals(interval_probs: np.ndarray) -> np.ndarray:
    """
    Restores complete 46-length discrete probability mass function P(S = s) for s in [0, 45]
    from 14 interval probabilities:
    - C_0 to C_10: single seats 0, 1, ..., 10
    - C_11: [11, 20] (10 seats)
    - C_12: [21, 30] (10 seats)
    - C_13: [31, 45] (15 seats)
    """
    assert len(interval_probs) == 14, f"Expected 14 intervals, got {len(interval_probs)}"
    
    # Softmax / normalize if needed
    probs = np.clip(np.array(interval_probs, dtype=np.float64), 0.0, None)
    s = probs.sum()
    if s > 0:
        probs /= s
    else:
        probs = np.full(14, 1.0 / 14)
        
    pmf = np.zeros(MAX_SEATS + 1, dtype=np.float64)
    
    # 0 to 10
    for seat in range(11):
        pmf[seat] = probs[seat]
        
    # 11 to 20
    for seat in range(11, 21):
        pmf[seat] = probs[11] / 10.0
        
    # 21 to 30
    for seat in range(21, 31):
        pmf[seat] = probs[12] / 10.0
        
    # 31 to 45
    for seat in range(31, 46):
        pmf[seat] = probs[13] / 15.0
        
    # Ensure exact sum = 1.0
    pmf_sum = pmf.sum()
    if pmf_sum > 0:
        pmf /= pmf_sum
        
    return pmf

def discrete_convolve(pmf_a: np.ndarray, pmf_b: np.ndarray) -> np.ndarray:
    """
    Computes discrete convolution of two PMFs:
    (P_X1 * P_X2)(z) = sum_{k=0}^z P(X1 = k) * P(X2 = z - k)
    """
    return np.convolve(pmf_a, pmf_b)

def compute_boarding_simulation(
    bus_pmfs: List[np.ndarray],
    queue_count: int
) -> Dict[str, Any]:
    """
    Simulates queue-linked boarding across up to 3 consecutive buses using discrete convolution.
    
    bus_pmfs: List of PMFs for B1, B2, B3 (each length 46, for seats 0..45).
    queue_count: Number of people waiting ahead in line (q >= 0).
    """
    q = max(0, int(queue_count))
    num_buses = len(bus_pmfs)
    assert num_buses >= 1, "At least 1 bus PMF required"
    
    # 1. First bus (B1)
    # User boards B1 if seats S_B1 > q => sum_{s = q + 1}^45 P(S_B1 = s)
    pmf1 = bus_pmfs[0]
    p_b1_success = float(np.sum(pmf1[q + 1:])) if q < len(pmf1) else 0.0
    
    # CDF for B1
    cdf1 = np.cumsum(pmf1)
    
    # 2. Cumulative with B2
    if num_buses >= 2:
        pmf2 = bus_pmfs[1]
        pmf_z2 = discrete_convolve(pmf1, pmf2)
        p_b2_cum_success = float(np.sum(pmf_z2[q + 1:])) if q < len(pmf_z2) else 0.0
    else:
        pmf_z2 = pmf1
        p_b2_cum_success = p_b1_success
        
    # 3. Cumulative with B3
    if num_buses >= 3:
        pmf3 = bus_pmfs[2]
        pmf_z3 = discrete_convolve(pmf_z2, pmf3)
        p_b3_cum_success = float(np.sum(pmf_z3[q + 1:])) if q < len(pmf_z3) else 0.0
    else:
        pmf_z3 = pmf_z2
        p_b3_cum_success = p_b2_cum_success
        
    # Expected passed buses distribution
    p_pass_0 = p_b1_success
    p_pass_1 = max(0.0, p_b2_cum_success - p_b1_success)
    p_pass_2 = max(0.0, p_b3_cum_success - p_b2_cum_success)
    p_pass_3_plus = max(0.0, 1.0 - p_b3_cum_success)
    
    pass_dist = {
        "0": round(p_pass_0, 4),
        "1": round(p_pass_1, 4),
        "2": round(p_pass_2, 4),
        "3_or_more": round(p_pass_3_plus, 4)
    }
    
    expected_pass_count = round(0 * p_pass_0 + 1 * p_pass_1 + 2 * p_pass_2 + 3 * p_pass_3_plus, 2)
    
    # Generate actionable recommendation
    if p_b1_success == 0.0 or (len(bus_pmfs) > 0 and bus_pmfs[0][0] >= 0.95 and q >= 1):
        if p_b2_cum_success >= 0.65:
            recommendation = f"첫 번째 버스는 현재 만차(0석)로 무정차 통과 가능성이 매우 높습니다. 후속(2번째) 버스 탑승을 준비하십시오 (2대 누적 {round(p_b2_cum_success*100, 1)}%)."
            risk_level = "HIGH"
        else:
            recommendation = f"연속 만차 및 탑승 지연 위험이 큽니다 ({round(p_pass_3_plus*100, 1)}% 통과 위험). 지하철 등 대체 수단을 권장합니다."
            risk_level = "CRITICAL"
    elif p_b1_success >= 0.75:
        recommendation = "첫 번째 버스에 즉시 탑승할 확률이 매우 높습니다 (쾌적)."
        risk_level = "LOW"
    elif p_b1_success >= 0.40:
        recommendation = f"첫 번째 버스 탑승 가능성이 보통이나, 2대 이내 탑승 확률은 {round(p_b2_cum_success*100, 1)}%입니다."
        risk_level = "MEDIUM"
    elif p_b2_cum_success >= 0.65:
        recommendation = f"첫 차는 만차 통과 가능성이 높습니다. 후속(2번째) 버스 탑승을 준비하십시오 (2대 누적 {round(p_b2_cum_success*100, 1)}%)."
        risk_level = "HIGH"
    else:
        recommendation = f"3대 연속 만차 및 탑승 지연 위험이 큽니다 ({round(p_pass_3_plus*100, 1)}% 통과 위험). 지하철 등 대체 수단 이용을 추천합니다."
        risk_level = "CRITICAL"
        
    return {
        "queue_count": q,
        "first_bus_success_prob": round(p_b1_success, 4),
        "two_bus_cum_success_prob": round(p_b2_cum_success, 4),
        "three_bus_cum_success_prob": round(p_b3_cum_success, 4),
        "passed_buses_distribution": pass_dist,
        "expected_passed_buses": expected_pass_count,
        "recommendation": recommendation,
        "risk_level": risk_level
    }
