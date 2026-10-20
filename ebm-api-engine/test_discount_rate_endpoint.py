import sys, json, io, csv, math
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

rows = [
    ['X','Y','Z','DX','DY','DZ','Grade','Density','RockType'],
    [0,0,50,10,10,10,1.5,2.7,'Ore'],
    [0,0,40,10,10,10,1.5,2.7,'Ore'],
    [0,0,30,10,10,10,1.5,2.7,'Ore'],
    [0,0,20,10,10,10,0.1,2.7,'Waste'],
    [0,0,10,10,10,10,0.1,2.7,'Waste'],
]
buf = io.StringIO()
csv.writer(buf).writerows(rows)
csv_bytes = buf.getvalue().encode()

base = dict(
    commodity_price=50000.0, ore_mining_cost=5000.0, waste_mining_cost=3000.0,
    processing_cost=8000.0, selling_cost=1000.0, metallurgical_recovery=0.9, osa=45.0,
    cut_off_grade=0.5, grade_unit='g_per_t', price_unit='per_gram', currency='IDR',
    revenue_factors=[1.0], production_capacity_tpy=2700.0, discount_rate=0.1
)

# TEST 1: r=0.1 -> npv < undiscounted
r1 = client.post('/api/v1/optimize-pit',
    data={'financial_params': json.dumps(base)},
    files={'file': ('t.csv', csv_bytes, 'text/csv')})
assert r1.status_code == 200, f"T1 status={r1.status_code}: {r1.text[:300]}"
c1 = r1.json()['pit_selection']['candidates'][0]
undis = c1['undiscounted_value']
npv_b = c1['npv_best']
npv_w = c1['npv_worst']
ml = c1['mine_life_years']
print(f"TEST1 undiscounted={undis:,.0f}  npv_best={npv_b:,.0f}  npv_worst={npv_w:,.0f}  mine_life={ml}")
assert npv_b < undis, f"FAIL T1: npv_best ({npv_b}) >= undiscounted ({undis})"
assert npv_w < undis, f"FAIL T1: npv_worst ({npv_w}) >= undiscounted ({undis})"
print("TEST1 PASS")

# TEST 2: r=0 -> npv == undiscounted
p2 = {**base, 'discount_rate': 0.0}
r2 = client.post('/api/v1/optimize-pit',
    data={'financial_params': json.dumps(p2)},
    files={'file': ('t.csv', csv_bytes, 'text/csv')})
c2 = r2.json()['pit_selection']['candidates'][0]
undis2 = c2['undiscounted_value']
npv_b2 = c2['npv_best']
npv_w2 = c2['npv_worst']
print(f"TEST2 undiscounted={undis2:,.0f}  npv_best={npv_b2:,.0f}  npv_worst={npv_w2:,.0f}")
assert math.isclose(npv_b2, undis2, rel_tol=1e-6), f"FAIL T2: npv_best ({npv_b2}) != undiscounted ({undis2})"
assert math.isclose(npv_w2, undis2, rel_tol=1e-6), f"FAIL T2: npv_worst ({npv_w2}) != undiscounted ({undis2})"
print("TEST2 PASS")

# TEST 3: r=1.5 -> HTTP 400
p3 = {**base, 'discount_rate': 1.5}
r3 = client.post('/api/v1/optimize-pit',
    data={'financial_params': json.dumps(p3)},
    files={'file': ('t.csv', csv_bytes, 'text/csv')})
assert r3.status_code == 400, f"FAIL T3: status={r3.status_code}, expected 400"
detail = r3.json().get('detail', '')
print(f"TEST3 detail: {detail[:150]}")
assert "discount_rate" in detail.lower() or "1" in detail, f"FAIL T3: pesan tidak menyebut discount_rate"
print("TEST3 PASS")

print("\nALL 3 ENDPOINT TESTS PASS")
