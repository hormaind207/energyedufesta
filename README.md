# 보이지 않는 손 그리드 ⚡

> 가격 밴드형 동네 전력시장 실시간 거래 시뮬레이션
> 2026 청소년 에너지 에듀페스타 고등부 정책 제안

동네에서 만든 태양광 전기를 이웃끼리 **시세대로** 사고팔게 하고, 한전은 가격이 너무 오르거나 떨어질 때만 막아주는 **"가격 밴드의 벽"** 역할만 하는 정책을 실제 공공데이터로 시뮬레이션한 웹페이지입니다.

## 무엇을 보여주나

- **3D 동네 모형**: 블렌더로 만든 설계 모형을 그대로 불러와, 지하 배전망을 따라 전기가 거래되는 모습을 보여줍니다.
  - 흰 알갱이: 동네 안 거래
  - 빨간 알갱이: 한전과의 거래 (남는 전기 판매, 모자란 전기 구매)
  - 청록 알갱이: ESS 충전·방전
  - 가격 밴드 탑의 노란 고리: 지금 동네 시세 (빨간 고리 = 상한·하한)
- **실시간 가격**: 공급 ÷ 수요(SDR)에 따라 1시간마다 시세가 자동으로 정해집니다. (실제 제도에서는 스마트계량기 측정 단위인 15분으로 운영 가능)
- **1년 결과**: 구매자 전기요금 절감률, 판매자 평균 판매가, 동네 자급률, 탄소 감축량, ESS 차익

## 가격 결정 방식 (SDR)

Liu et al.(2017)이 제안한 공급수요비율(SDR) 방식을 사용합니다.

```
SDR = 동네 공급 ÷ 동네 수요

SDR ≤ 1 (전기가 모자랄 때)
  판매가 = 상한 × 하한 ÷ ((상한 − 하한) × SDR + 하한)
  구매가 = 판매가 × SDR + 상한 × (1 − SDR)

SDR > 1 (전기가 남을 때)
  판매가 = 구매가 = 하한

상한 = 한전 소매요금(누진 구간별),  하한 = 한전 매입가(SMP)
```

ESS는 남는 전기를 하한가로 충전하고, 동네 시세를 하한까지 무너뜨리지 않는 만큼만(한계수익 = 충전 원가가 되는 지점까지) 방전합니다.

## 폴더 구조

```
invisible-hand-grid/
├── index.html                 화면 구조
├── css/style.css              디자인
├── js/app.js                  시뮬레이션 계산 + 3D 애니메이션
├── data/region_data.json      17개 시도 시간대별 태양광·수요 패턴 (8,760시간)
├── models/town.glb            블렌더 3D 모형 (웹용 내보내기)
├── vendor/three/              three.js r147 (MIT 라이선스)
├── scripts/
│   └── prepare_region_data.py 공공데이터 원본 → data/region_data.json 변환
├── vercel.json                Vercel 배포 설정
└── README.md
```

## 내 컴퓨터에서 실행하기

`index.html`을 더블클릭하면 브라우저 보안 규칙 때문에 데이터와 모형을 불러오지 못합니다. 간단한 로컬 서버로 열어야 해요.

```bash
# 프로젝트 폴더에서
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

VS Code를 쓴다면 **Live Server** 확장으로 `index.html`을 열어도 됩니다.

## GitHub에 올리기

1. GitHub에서 새 저장소(Repository)를 만듭니다. 예: `invisible-hand-grid`
2. 이 폴더에서 아래 명령을 실행합니다.

```bash
git init
git add .
git commit -m "보이지 않는 손 그리드 시뮬레이션"
git branch -M main
git remote add origin https://github.com/<내아이디>/invisible-hand-grid.git
git push -u origin main
```

명령어가 익숙하지 않으면 GitHub 저장소 페이지의 **Add file → Upload files**로 폴더 안의 파일을 끌어다 놓아도 됩니다. (폴더 구조가 그대로 유지되게 올려주세요.)

## Vercel로 배포하기

1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인합니다.
2. **Add New… → Project**에서 방금 만든 저장소를 **Import**합니다.
3. 설정은 그대로 두면 됩니다.
   - Framework Preset: **Other**
   - Build Command: 비워두기
   - Output Directory: 비워두기 (루트 그대로)
4. **Deploy**를 누르면 `https://<프로젝트이름>.vercel.app` 주소가 생깁니다.

이후 GitHub에 수정 사항을 올리면(push) Vercel이 자동으로 다시 배포합니다.

## 데이터 출처

| 데이터 | 출처 | 기간 |
|---|---|---|
| 시도별·시간별 태양광 거래량 | 한국전력거래소 (공공데이터포털 15065269) | 2025년 |
| 지역본부별·시간별 전력사용량 | 한국전력공사 (공공데이터포털 15151157) | 2024년 |
| 주택용 누진 단계별 전력량요금 | 한국전력공사 전기요금표 (+ 기후환경요금 9원, 연료비조정요금 5원) | 2026년 |
| 전력 배출계수 0.4173 tCO₂eq/MWh | 2023년 공표값 | 2023년 |

원본 CSV는 용량이 커서 저장소에 넣지 않았습니다. 다시 만들려면 `scripts/prepare_region_data.py` 상단 설명대로 내려받아 `scripts/raw/`에 넣고 실행하세요.

## 한계

- 구 단위 시간별 데이터가 없어, 시도·한전 지역본부의 실제 시간 패턴을 사용했습니다.
- 한전 소비 데이터는 상가·공장까지 섞인 전체 사용량이라 주택만의 패턴과 다를 수 있습니다.
- 태양광 보유 가구의 자가소비, 기본요금·부가세는 두 경우 모두 같다고 보고 뺐습니다.
- 망 이용료 기본값 10원/kWh는 비교를 위한 가정값입니다.
- ESS 차익에는 설비비·열화·유지비·인버터 교체비가 들어 있지 않습니다.

## 참고 문헌

- Liu, N. et al. (2017). Energy-Sharing Model With Price-Based Demand Response for Microgrids of Peer-to-Peer Prosumers. *IEEE Transactions on Power Systems*, 32, 3569–3583.
- Zhou, Y., Wu, J., Long, C. (2018). Evaluation of peer-to-peer energy sharing mechanisms based on a multiagent simulation framework. *Applied Energy*.
- Sousa, T. et al. (2019). Peer-to-peer and community-based markets: A comprehensive review. *Renewable and Sustainable Energy Reviews*.
