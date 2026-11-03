"""
공공데이터포털 원본 CSV 두 개를 웹 시뮬레이션용 data/region_data.json 으로 바꾸는 스크립트.

필요한 원본 (공공데이터포털에서 직접 내려받기):
  1) 한국전력거래소_지역별 시간별 태양광 및 풍력 발전량 (2025년)  https://www.data.go.kr/data/15065269/fileData.do
     -> scripts/raw/solar.csv  (인코딩 cp949)
  2) 한국전력공사_전국 시간별 전력사용량 (2022~2024년)          https://www.data.go.kr/data/15151157/fileData.do
     -> scripts/raw/load.csv   (인코딩 utf-8-sig)

실행:  pip install pandas numpy
       python scripts/prepare_region_data.py

출력 형식: 시도마다 {"s": 태양광, "l": 수요} 를 365일×24시간(8,760칸) 패턴으로 저장.
각 값은 그 지역 최댓값을 255로 맞춘 0~255 정수이고, base64 로 압축해 담는다.
(웹에서는 '모양'만 쓰고, 실제 크기는 태양광 보급률과 가구 수로 다시 맞춘다.)
"""
import base64, json, os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "data", "region_data.json")

# 시도(태양광 데이터) -> 한전 지역본부(수요 데이터) 대응표
REGION_MAP = {
    "서울": (["서울시"], ["서울본부", "남서울본부"]),
    "부산": (["부산시"], ["부산울산본부"]),
    "대구": (["대구시"], ["대구본부"]),
    "인천": (["인천시"], ["인천본부"]),
    "광주": (["광주시"], ["광주전남본부"]),
    "대전": (["대전시"], ["대전세종충남본부"]),
    "울산": (["울산시"], ["부산울산본부"]),
    "세종": (["세종시"], ["대전세종충남본부"]),
    "경기": (["경기도"], ["경기본부", "경기북부본부"]),
    "강원": (["강원도"], ["강원본부"]),
    "충북": (["충청북도"], ["충북본부"]),
    "충남": (["충청남도"], ["대전세종충남본부"]),
    "전북": (["전라북도"], ["전북본부"]),
    "전남": (["전라남도"], ["광주전남본부"]),
    "경북": (["경상북도"], ["경북본부"]),
    "경남": (["경상남도"], ["경남본부"]),
    "제주": (["제주도"], ["제주본부"]),
}


def load_tables():
    sol = pd.read_csv(os.path.join(RAW, "solar.csv"), encoding="cp949")
    sol = sol[sol["연료원"] == "태양광"].rename(columns={"전력거래량(MWh)": "v", "거래시간": "h", "지역": "reg"})
    sol["dt"] = pd.to_datetime(sol["거래일"])

    load = pd.read_csv(os.path.join(RAW, "load.csv"), encoding="utf-8-sig")
    load = load.rename(columns={"전력사용량": "v", "기준시": "h", "본부명": "reg"})
    load["dt"] = pd.to_datetime(load["기준일자"])
    load = load[load["dt"].dt.year == 2024]                                   # 가장 최근 1년
    load = load[~((load["dt"].dt.month == 2) & (load["dt"].dt.day == 29))]   # 윤일 제거 -> 365일
    return sol, load


def to_grid(df, regions):
    """여러 지역을 합쳐 365×24 배열로 만든다. 2024년은 윤일 이후 날짜를 하루 당겨 2025년 날짜에 맞춘다."""
    d = df[df["reg"].isin(regions)].groupby(["dt", "h"])["v"].sum().reset_index()
    doy = d["dt"].dt.dayofyear.values.copy()
    if d["dt"].dt.year.iloc[0] == 2024:
        doy[d["dt"].dt.month.values > 2] -= 1
    arr = np.full((365, 24), np.nan)
    h = d["h"].values.astype(int) - 1
    ok = (h >= 0) & (h < 24) & (doy >= 1) & (doy <= 365)
    arr[doy[ok] - 1, h[ok]] = d["v"].values[ok]
    return arr


def pack(arr):
    a8 = np.round(arr / arr.max() * 255).astype(np.uint8)
    return base64.b64encode(a8.tobytes()).decode()


def main():
    sol, load = load_tables()
    out = {}
    for name, (solar_regions, load_regions) in REGION_MAP.items():
        s = np.nan_to_num(to_grid(sol, solar_regions), nan=0.0)
        s[s < 0] = 0
        l = to_grid(load, load_regions)
        l = pd.Series(l.ravel()).interpolate(limit_direction="both").values.reshape(365, 24)
        out[name] = {"s": pack(s), "l": pack(l)}
        print(f"{name}: 태양광 정점 {int(np.argmax(s.mean(0))) + 1}시, 수요 정점 {int(np.argmax(l.mean(0))) + 1}시")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("저장:", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
