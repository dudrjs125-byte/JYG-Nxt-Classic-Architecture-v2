# 🤔 결정장애 도우미 - AI 선택 추천 서비스

> 고민되는 상황을 입력하면 Gemini / Nova AI가 대신 결정해주는 웹 애플리케이션

## � 앱 소개

일상에서 결정이 어려운 순간(점심 메뉴, 여행지, 옷 선택 등)에 AI에게 추천을 받을 수 있는 서비스입니다.
Google Gemini와 Amazon Nova 두 가지 AI를 선택하여 비교할 수 있으며, 후속 질문으로 대화를 이어갈 수 있습니다.

## 🏗️ 사용한 AWS 리소스

| 리소스 | 용도 |
|--------|------|
| **EC2** | Express 백엔드 서버 호스팅 |
| **S3** | React 프론트엔드 정적 웹 호스팅 |
| **RDS (MySQL)** | 질문/답변 데이터 저장 |
| **Lambda (Python)** | Amazon Bedrock Nova AI 호출 |
| **Lambda (Node.js)** | Google Gemini AI 호출 |
| **Bedrock** | Amazon Nova Lite 모델 사용 |

## 📊 아키텍처

```
[S3 - React 프론트엔드]
        ↕
[EC2 - Express 서버]
    ↕           ↕
[RDS MySQL]   [Lambda Functions]
                ↕           ↕
          [Bedrock Nova]  [Gemini API]
```

## � 실행 방법

### 1. 서버 실행 (EC2)

```bash
cd JYG_selection_assistance_AI/server/
npm install

# .env 파일 생성
cat > .env << EOF
DB_HOST=<RDS 엔드포인트>
DB_USER=<DB 사용자명>
DB_PASSWORD=<DB 비밀번호>
DB_NAME=<DB 이름>
GEMINI_LAMBDA_URL=<Gemini Lambda 함수 URL>
BEDROCK_LAMBDA_URL=<Bedrock Lambda 함수 URL>
EOF

sudo $(which node) server.js
```

### 2. 프론트엔드 빌드 및 배포 (S3)

```bash
cd JYG_selection_assistance_AI/client/
npm install

# .env 파일 생성
echo "REACT_APP_SERVER_URL=http://<EC2 퍼블릭 IP>" > .env

npm run build
# build 폴더를 S3 버킷에 업로드
aws s3 sync build/ s3://<S3 버킷명>
```

### 3. Lambda 함수 배포

- **Gemini Lambda**: `gemini-lambda/index.js` → Lambda 콘솔에서 Node.js 런타임으로 배포
- **Bedrock Lambda**: `bedrock-lambda/lambda_function.py` → Lambda 콘솔에서 Python 런타임으로 배포
- 두 Lambda 모두 환경변수에 DB 접속 정보 설정 필요

## 🧪 테스트 방법

1. S3 웹사이트 URL로 접속
2. 고민 입력란에 질문 입력 (예: "점심 메뉴 추천해줘")
3. **🤖 Gemini 추천** 또는 **🌟 Nova 추천** 버튼 클릭
4. AI 답변 확인 후, 후속 질문 입력란에서 추가 질문 가능
5. 하단 질문 기록에서 이전 대화 확인 및 이어서 질문 가능

### 샘플 질문

- "오늘 점심 뭐 먹을지 추천해줘"
- "주말에 서울 근교 여행지 골라줘"
- "자바 vs 파이썬 뭐 먼저 배울까"

## ⚠️ 주의사항

- `.env` 파일은 `.gitignore`에 포함되어 있어 GitHub에 업로드되지 않습니다.
- API 키, DB 비밀번호 등 민감한 정보는 절대 커밋하지 마세요.
- Lambda 함수의 환경변수도 AWS 콘솔에서 직접 설정하세요.
