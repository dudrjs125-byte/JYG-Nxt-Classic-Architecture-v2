const { GoogleGenerativeAI } = require("@google/generative-ai");
const mysql = require('mysql2');

exports.handler = async (event) => {
    console.log("EC2 -> Lambda로 전달된 데이터", event.body)
    // 환경 변수에서 Gemini API 키와 데이터베이스 연결 정보를 불러옵니다.
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    let inputData;
    try {
        inputData = JSON.parse(event.body);
    } catch (error) {
        console.error('JSON 파싱 오류:', error);
        return { statusCode: 400, body: 'Invalid JSON format' };
    }

    if (!inputData || !inputData.content || !inputData.noteId) {
        console.error('Invalid request: No content or noteId provided');
        return { statusCode: 400, body: 'No content or noteId provided' };
    }
    
    const userMessage = inputData.content;
    const noteId = inputData.noteId;
    console.log("ai한테 보낼 유저 메시지 내용", inputData.content, typeof inputData.content)
    
    try {
        // Gemini AI API 호출 (단순 텍스트 형태)
        const prompt = `당신은 사용자의 결정을 도와주는 AI 어시스턴트입니다. 사용자가 고민하는 상황에 대해 구체적인 추천을 해주세요. 이유와 함께 명확하게 하나를 골라주되, 다른 선택지도 간단히 언급해주세요. 반드시 한국어로 답변하세요.

사용자의 고민: ${userMessage}`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();
        
        console.log("ai 한테 받아왔어?", aiResponse)

        // 데이터베이스에 AI 응답 저장
        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        };
        const db = mysql.createConnection(dbConfig);
        db.connect();

        const sql = 'UPDATE notes SET ai_note = ?, ai_type = ? WHERE id = ?';
        const values = [aiResponse, 'gemini', noteId];
        await new Promise((resolve, reject) => {
            db.query(sql, values, (err, result) => {
                if (err) reject(err);
                resolve(result);
            });
        });

        db.end();

        return aiResponse;
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Lambda function error');
    }
};
