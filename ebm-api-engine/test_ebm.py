import pandas as pd
import json
import io
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_optimize_pit():
    # Buat dummy block model (CSV)
    # Z = Elevasi (makin besar makin tinggi)
    # Asumsi:
    # Blok 0 (0,0,10) - Surface (Waste)
    # Blok 1 (0,0,0)  - Deep (Ore, High Grade)
    
    # Kita butuh dimensi DX, DY, DZ misal 10,10,10
    
    csv_content = """X,Y,Z,DX,DY,DZ,Grade,Density,RockType
0,0,10,10,10,10,0.0,2.5,Waste
0,0,0,10,10,10,5.0,3.0,Ore
"""
    
    financial_params = {
        "commodity_price": 50.0,
        "ore_mining_cost": 2.0,
        "waste_mining_cost": 1.5,
        "processing_cost": 10.0,
        "selling_cost": 3.0,
        "metallurgical_recovery": 0.9,
        "osa": 45.0
    }
    
    files = {
        'file': ('dummy.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')
    }
    data = {
        'financial_params': json.dumps(financial_params)
    }
    
    response = client.post("/api/v1/optimize-pit", files=files, data=data)
    
    assert response.status_code == 200
    res_json = response.json()
    
    print("Summary:", res_json['summary'])
    print("Pit Shell Matrix:", res_json['pit_shell_matrix'])
    
    assert res_json['summary']['total_ore_tonnage'] > 0
    assert len(res_json['pit_shell_matrix']) == 2
    
if __name__ == "__main__":
    test_optimize_pit()
    print("Test passed!")
